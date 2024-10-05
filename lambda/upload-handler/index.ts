import { AppSyncResolverEvent } from "aws-lambda";
import * as AWS from "aws-sdk";
import { v4 as uuidv4 } from "uuid";

const s3 = new AWS.S3();
const dynamodb = new AWS.DynamoDB.DocumentClient();
const sqs = new AWS.SQS();

const S3_BUCKET = process.env.S3_BUCKET!;
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE!;
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL!;

interface UploadDocumentArgs {
  fileName: string;
  contentType: string;
}

export const handler = async (
  event: AppSyncResolverEvent<UploadDocumentArgs>
): Promise<any> => {
  try {
    const { fileName, contentType } = event.arguments;
    if (!fileName || !contentType) {
      throw new Error("Missing fileName or contentType");
    }

    // Generate a unique document ID
    const documentId = uuidv4();
    const s3Key = `uploads/${documentId}/${fileName}`;

    // Generate pre-signed URL
    const presignedUrl = await s3.getSignedUrlPromise("putObject", {
      Bucket: S3_BUCKET,
      Key: s3Key,
      Expires: 3600, // 1 hour
      ContentType: contentType,
    });

    // Store initial metadata in DynamoDB
    await dynamodb
      .put({
        TableName: DYNAMODB_TABLE,
        Item: {
          documentId,
          s3Key,
          status: "UPLOADED",
          uploadTime: new Date().toISOString(),
        },
      })
      .promise();

    // Send message to SQS for processing
    await sqs
      .sendMessage({
        QueueUrl: SQS_QUEUE_URL,
        MessageBody: JSON.stringify({ documentId, s3Key }),
      })
      .promise();

    return {
      presignedUrl,
      documentId,
    };
  } catch (error) {
    console.error("Error in upload-handler:", error);
    throw error;
  }
};
