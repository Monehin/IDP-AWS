import { AttributeValue } from "@aws-sdk/client-dynamodb";

export interface DynamoDBUpdateParams {
  TableName: string;
  Key: { [key: string]: AttributeValue };
  UpdateExpression: string;
  ExpressionAttributeNames?: { [key: string]: string };
  ExpressionAttributeValues: { [key: string]: AttributeValue };
}

export interface LambdaEvent {
  documentId: string;
  s3Key: string;
}

export interface DocumentMetadata {
  documentId: string;
  s3Key: string;
  status: string;
  uploadTime: string;
}

export interface UploadDocumentArgs {
  fileName: string;
  contentType: string;
}

export interface UploadResponse {
  presignedUrl: string;
  documentId: string;
}
