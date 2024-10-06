import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SQSClient } from "@aws-sdk/client-sqs";
import { S3Client } from "@aws-sdk/client-s3";
import { TextractClient } from "@aws-sdk/client-textract";
import { ComprehendClient } from "@aws-sdk/client-comprehend";
import { AWS_REGION } from "./environment";

export const dynamoDBClient = new DynamoDBClient({ region: AWS_REGION });
export const sqsClient = new SQSClient({ region: AWS_REGION });
export const s3Client = new S3Client({ region: AWS_REGION });
export const textractClient = new TextractClient({ region: AWS_REGION });
export const comprehendClient = new ComprehendClient({ region: AWS_REGION });
