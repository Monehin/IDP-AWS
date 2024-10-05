import { Context } from "aws-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import {
  DynamoDBClient,
  UpdateItemCommand,
  AttributeValue,
} from "@aws-sdk/client-dynamodb";
import {
  TextractClient,
  AnalyzeDocumentCommand,
  Block,
  AnalyzeDocumentCommandOutput,
} from "@aws-sdk/client-textract";
import {
  ComprehendClient,
  DetectEntitiesCommand,
  DetectEntitiesCommandOutput,
} from "@aws-sdk/client-comprehend";
import { Readable } from "stream";

// TypeScript Interfaces
interface LambdaEvent {
  documentId: string;
  s3Key: string;
}

interface DynamoDBUpdateParams {
  TableName: string;
  Key: { [key: string]: AttributeValue };
  UpdateExpression: string;
  ExpressionAttributeNames?: { [key: string]: string };
  ExpressionAttributeValues: { [key: string]: AttributeValue };
}

// Environment Variables
const S3_BUCKET = process.env.S3_BUCKET!;
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE!;
const AWS_REGION = process.env.AWS_REGION || "us-west-1";
const s3Client = new S3Client({ region: AWS_REGION });
const dynamoDBClient = new DynamoDBClient({ region: AWS_REGION });
const textractClient = new TextractClient({ region: AWS_REGION });
const comprehendClient = new ComprehendClient({ region: AWS_REGION });

// Helper Functions
const updateDynamoDBStatus = async (params: DynamoDBUpdateParams) => {
  try {
    const command = new UpdateItemCommand(params);
    await dynamoDBClient.send(command);
  } catch (error) {
    console.error("Failed to update DynamoDB status:", error);
    throw error;
  }
};

const getS3Object = async (bucket: string, key: string): Promise<Buffer> => {
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

const analyzeDocument = async (
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

const detectEntities = async (
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

export const handler = async (
  event: LambdaEvent,
  context: Context
): Promise<void> => {
  const { documentId, s3Key } = event;

  // Input Validation
  if (!documentId || !s3Key) {
    console.error("Invalid input: documentId and s3Key are required");
    return;
  }

  try {
    // Update DynamoDB status to PROCESSING
    await updateDynamoDBStatus({
      TableName: DYNAMODB_TABLE,
      Key: { documentId: { S: documentId } },
      UpdateExpression: "SET #status = :status",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": { S: "PROCESSING" } },
    });

    // Get the object from S3
    const documentBytes = await getS3Object(S3_BUCKET, s3Key);

    // Analyze Document with Textract
    const textractResult = await analyzeDocument(documentBytes);

    // Extract text blocks with type annotations
    const textBlocks = textractResult.Blocks?.filter(
      (block: Block) => block.BlockType === "LINE"
    ).map((block: Block) => block.Text || "");

    const fullText = textBlocks?.join(" ") || "";

    // Detect Entities with Comprehend
    const comprehendEntitiesResult = await detectEntities(fullText);

    // Update DynamoDB with processing results
    await updateDynamoDBStatus({
      TableName: DYNAMODB_TABLE,
      Key: { documentId: { S: documentId } },
      UpdateExpression:
        "SET #status = :status, processedTime = :processedTime, textractData = :textractData, comprehendEntities = :comprehendEntities",
      ExpressionAttributeNames: {
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":status": { S: "PROCESSED" },
        ":processedTime": { S: new Date().toISOString() },
        ":textractData": { S: JSON.stringify(textractResult) },
        ":comprehendEntities": {
          S: JSON.stringify(comprehendEntitiesResult.Entities),
        },
      },
    });

    // Optionally, send a notification via AppSync or SNS
    // await sendNotification(documentId);
  } catch (error: any) {
    console.error("Error processing document:", error);

    // Update DynamoDB status to ERROR
    try {
      await updateDynamoDBStatus({
        TableName: DYNAMODB_TABLE,
        Key: { documentId: { S: documentId } },
        UpdateExpression: "SET #status = :status, errorMessage = :errorMessage",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":status": { S: "ERROR" },
          ":errorMessage": { S: error.message || "Unknown error" },
        },
      });
    } catch (dynamoError) {
      console.error(
        "Failed to update DynamoDB with error status:",
        dynamoError
      );
    }
  }
};
