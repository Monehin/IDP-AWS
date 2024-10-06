import { GetObjectCommand } from "@aws-sdk/client-s3";
import { UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import {
  AnalyzeDocumentCommand,
  AnalyzeDocumentCommandOutput,
} from "@aws-sdk/client-textract";
import {
  DetectEntitiesCommand,
  DetectEntitiesCommandOutput,
} from "@aws-sdk/client-comprehend";
import { Readable } from "stream";
import {
  dynamoDBClient,
  s3Client,
  sqsClient,
  textractClient,
  comprehendClient,
} from "../common/aws-clients";
import { GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import { DYNAMODB_TABLE, SQS_QUEUE_URL } from "../common/environment";
import { DynamoDBUpdateParams, DocumentMetadata } from "../common/types";

// Helper Functions
export const updateDynamoDBStatus = async (params: DynamoDBUpdateParams) => {
  try {
    const command = new UpdateItemCommand(params);
    await dynamoDBClient.send(command);
  } catch (error) {
    console.error("Failed to update DynamoDB status:", error);
    throw error;
  }
};

export const getS3Object = async (
  bucket: string,
  key: string
): Promise<Buffer> => {
  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(command);

    if (!response.Body) {
      throw new Error("S3 object body is empty");
    }

    const stream = response.Body as Readable;
    const chunks: Uint8Array[] = [];

    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  } catch (error) {
    console.error("Failed to get S3 object:", error);
    throw error;
  }
};

export const analyzeDocument = async (
  documentBytes: Buffer
): Promise<AnalyzeDocumentCommandOutput> => {
  try {
    const command = new AnalyzeDocumentCommand({
      Document: { Bytes: documentBytes },
      FeatureTypes: ["TABLES", "FORMS"],
    });
    const response = await textractClient.send(command);
    return response;
  } catch (error) {
    console.error("Failed to analyze document with Textract:", error);
    throw error;
  }
};

export const detectEntities = async (
  text: string
): Promise<DetectEntitiesCommandOutput> => {
  try {
    const command = new DetectEntitiesCommand({
      LanguageCode: "en",
      Text: text,
    });
    const response = await comprehendClient.send(command);
    return response;
  } catch (error) {
    console.error("Failed to detect entities with Comprehend:", error);
    throw error;
  }
};

export const checkIfDocumentExists = async (
  documentId: string
): Promise<boolean> => {
  try {
    const command = new GetItemCommand({
      TableName: DYNAMODB_TABLE,
      Key: { documentId: { S: documentId } },
    });
    const existingItem = await dynamoDBClient.send(command);
    return existingItem.Item !== undefined;
  } catch (error) {
    console.error("Failed to check DynamoDB for existing document:", error);
    throw error;
  }
};

export const putNewDocumentRecord = async (
  metadata: DocumentMetadata
): Promise<void> => {
  try {
    const command = new PutItemCommand({
      TableName: DYNAMODB_TABLE,
      Item: {
        documentId: { S: metadata.documentId },
        s3Key: { S: metadata.s3Key },
        status: { S: metadata.status },
        uploadTime: { S: metadata.uploadTime },
      },
    });
    await dynamoDBClient.send(command);
  } catch (error) {
    console.error("Failed to insert new document into DynamoDB:", error);
    throw error;
  }
};

export const sendMessageToSQS = async (
  documentId: string,
  s3Key: string
): Promise<void> => {
  try {
    const command = new SendMessageCommand({
      QueueUrl: SQS_QUEUE_URL,
      MessageBody: JSON.stringify({ documentId, s3Key }),
    });
    await sqsClient.send(command);
  } catch (error) {
    console.error("Failed to send message to SQS:", error);
    throw error;
  }
};
