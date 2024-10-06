// lambda/upload-handler/index.ts
import { AppSyncResolverEvent } from "aws-lambda";
import { v4 as uuidv4 } from "uuid";
import {
  S3_BUCKET,
  DYNAMODB_TABLE,
  SQS_QUEUE_URL,
} from "../common/environment";
import { s3Client, dynamoDBClient, sqsClient } from "../common/aws-clients";
import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { UploadDocumentArgs, UploadResponse } from "../common/types";

export const handler = async (
  event: AppSyncResolverEvent<UploadDocumentArgs>
): Promise<UploadResponse> => {
  try {
    const { fileName, contentType } = event.arguments;

    if (!fileName || !contentType) {
      throw new Error("Missing fileName or contentType");
    }

    // Generate a unique document ID
    const documentId = uuidv4();
    const s3Key = `uploads/api/${documentId}/${fileName}`;

    // Generate pre-signed URL using AWS SDK v3
    const presignedUrl = await getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        ContentType: contentType,
      }),
      { expiresIn: 3600 } // Expires in 1 hour
    );

    // Store initial metadata in DynamoDB
    const putItemCommand = new PutItemCommand({
      TableName: DYNAMODB_TABLE,
      Item: {
        documentId: { S: documentId },
        s3Key: { S: s3Key },
        status: { S: "UPLOADED" },
        uploadTime: { S: new Date().toISOString() },
      },
    });

    await dynamoDBClient.send(putItemCommand);

    // Send message to SQS for processing
    const sendMessageCommand = new SendMessageCommand({
      QueueUrl: SQS_QUEUE_URL,
      MessageBody: JSON.stringify({ documentId, s3Key }),
    });

    await sqsClient.send(sendMessageCommand);

    return {
      presignedUrl,
      documentId,
    };
  } catch (error) {
    console.error("Error in upload-handler:", error);
    throw error;
  }
};
