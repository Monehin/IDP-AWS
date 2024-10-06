import * as cdk from "aws-cdk-lib";
import {
  aws_s3 as s3,
  aws_s3_notifications as s3n,
  aws_lambda as lambda,
  aws_lambda_nodejs as lambdaNodejs,
  aws_dynamodb as dynamodb,
  aws_cognito as cognito,
  aws_appsync as appsync,
  aws_sqs as sqs,
  aws_stepfunctions as sfn,
  aws_stepfunctions_tasks as tasks,
  aws_iam as iam,
} from "aws-cdk-lib";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import { Construct } from "constructs";

export class DocumentProcessingAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 Bucket for document uploads with encryption
    const bucket = new s3.Bucket(this, "DocumentUploadBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
      // Updated removal policy for production safety
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // DynamoDB Table with encryption
    const table = new dynamodb.Table(this, "DocumentsTable", {
      partitionKey: { name: "documentId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Amazon Cognito User Pool
    const userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: true,
      userVerification: {
        emailSubject: "Verify your email for our document processing app!",
        emailBody: "Thanks for signing up! Your verification code is {####}",
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      signInAliases: { email: true },
    });

    const userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
      userPool,
    });

    // AppSync GraphQL API
    const api = new appsync.GraphqlApi(this, "DocumentProcessingAPI", {
      name: "DocumentProcessingAPI",
      definition: appsync.Definition.fromFile("graphql/schema.graphql"),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: { userPool },
        },
      },
      xrayEnabled: true,
    });

    // Amazon SQS Queue
    const queue = new sqs.Queue(this, "DocumentProcessingQueue", {
      visibilityTimeout: cdk.Duration.minutes(10), // Increased timeout
      encryption: sqs.QueueEncryption.KMS_MANAGED,
    });

    // --- IAM Roles with Least Privilege ---

    // IAM Role for Upload Handler Lambda Function
    const uploadLambdaRole = new iam.Role(this, "UploadLambdaExecutionRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });

    uploadLambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSLambdaBasicExecutionRole"
      )
    );

    // Permissions for Upload Handler
    bucket.grantPut(uploadLambdaRole); // Allows uploading to S3 bucket
    table.grantWriteData(uploadLambdaRole); // Allows writing to DynamoDB table
    queue.grantSendMessages(uploadLambdaRole); // Allows sending messages to SQS queue

    // IAM Role for Processing Handler Lambda Function
    const processingLambdaRole = new iam.Role(
      this,
      "ProcessingLambdaExecutionRole",
      {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      }
    );

    processingLambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSLambdaBasicExecutionRole"
      )
    );

    // Permissions for Processing Handler
    bucket.grantRead(processingLambdaRole); // Allows reading from S3 bucket
    table.grantReadWriteData(processingLambdaRole); // Allows reading and writing to DynamoDB table

    processingLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "textract:AnalyzeDocument",
          "comprehend:DetectEntities",
          "comprehend:ClassifyDocument",
        ],
        resources: ["*"], // Ideally, scope down to specific resources if possible
      })
    );

    processingLambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:GetItem", "dynamodb:UpdateItem"],
        resources: [table.tableArn],
      })
    );

    // IAM Role for Queue Processing Handler Lambda Function
    const queueProcessingLambdaRole = new iam.Role(
      this,
      "QueueProcessingLambdaExecutionRole",
      {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      }
    );

    queueProcessingLambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSLambdaBasicExecutionRole"
      )
    );

    // IAM Role for S3 event Handler Lambda Function

    const s3EventLambdaRole = new iam.Role(this, "S3EventLambdaExecutionRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });

    // Permissions for Queue Processing Handler
    queue.grantConsumeMessages(queueProcessingLambdaRole); // Allows consuming messages from SQS queue

    // Step Functions State Machine (defined later) will grant start execution permission

    // --- Lambda Functions ---

    // Lambda Function: Document Upload Handler
    const uploadHandler = new lambdaNodejs.NodejsFunction(
      this,
      "UploadHandler",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: "lambda/upload-handler/index.ts",
        handler: "handler",
        environment: {
          S3_BUCKET: bucket.bucketName,
          DYNAMODB_TABLE: table.tableName,
          SQS_QUEUE_URL: queue.queueUrl,
        },
        role: uploadLambdaRole, // Uses dedicated role
        tracing: lambda.Tracing.ACTIVE,
        timeout: cdk.Duration.seconds(30), // Adjusted timeout
      }
    );

    // Add GraphQL resolvers
    const uploadDataSource = api.addLambdaDataSource(
      "uploadLambdaDataSource",
      uploadHandler
    );

    uploadDataSource.createResolver("UploadDocumentResolver", {
      typeName: "Mutation",
      fieldName: "uploadDocument",
    });

    // Lambda Function: Document Processing Handler
    const processingHandler = new lambdaNodejs.NodejsFunction(
      this,
      "ProcessingHandler",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: "lambda/processing-handler/index.ts",
        handler: "handler",
        environment: {
          S3_BUCKET: bucket.bucketName,
          DYNAMODB_TABLE: table.tableName,
        },
        role: processingLambdaRole, // Uses dedicated role
        tracing: lambda.Tracing.ACTIVE,
        timeout: cdk.Duration.minutes(5), // Adjusted timeout
      }
    );

    // Lambda Function: S3 Event Handler
    const s3EventHandler = new lambdaNodejs.NodejsFunction(
      this,
      "S3EventHandler",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: "lambda/s3-event-handler/index.ts",
        handler: "handler",
        environment: {
          S3_BUCKET: bucket.bucketName,
          DYNAMODB_TABLE: table.tableName,
          SQS_QUEUE_URL: queue.queueUrl,
        },
        role: s3EventLambdaRole,
        tracing: lambda.Tracing.ACTIVE,
      }
    );

    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(s3EventHandler),
      { prefix: "uploads/direct/" }
    );

    s3EventHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:GetItem", "dynamodb:PutItem"],
        resources: [table.tableArn],
      })
    );

    s3EventHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["sqs:SendMessage"],
        resources: [queue.queueArn],
      })
    );

    // Grant necessary permissions
    bucket.grantReadWrite(s3EventHandler);
    table.grantReadWriteData(s3EventHandler);
    queue.grantSendMessages(s3EventHandler);

    // Step Functions Task: Process Document
    const processDocumentTask = new tasks.LambdaInvoke(
      this,
      "ProcessDocumentTask",
      {
        lambdaFunction: processingHandler,
        outputPath: "$.Payload",
      }
    );

    // Step Functions Definition
    const definition = processDocumentTask;

    // Step Functions State Machine
    const stateMachine = new sfn.StateMachine(
      this,
      "DocumentProcessingStateMachine",
      {
        definition,
        timeout: cdk.Duration.minutes(5),
      }
    );

    // Grant permissions to State Machine for Queue Processing Lambda
    stateMachine.grantStartExecution(queueProcessingLambdaRole);

    // Lambda Function: Queue Processing Handler
    const queueProcessingHandler = new lambdaNodejs.NodejsFunction(
      this,
      "QueueProcessingHandler",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: "lambda/queue-processing-handler/index.ts",
        handler: "handler",
        environment: {
          STATE_MACHINE_ARN: stateMachine.stateMachineArn,
        },
        role: queueProcessingLambdaRole, // Uses dedicated role
        tracing: lambda.Tracing.ACTIVE,
        timeout: cdk.Duration.minutes(5), // Adjusted timeout
      }
    );

    // SQS Event Source for Lambda
    queueProcessingHandler.addEventSource(
      new lambdaEventSources.SqsEventSource(queue, { batchSize: 1 })
    );

    // Outputs (Optional: Remove in production if sensitive)
    new cdk.CfnOutput(this, "GraphQLAPIURL", {
      value: api.graphqlUrl,
    });

    new cdk.CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
    });

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });
  }
}
