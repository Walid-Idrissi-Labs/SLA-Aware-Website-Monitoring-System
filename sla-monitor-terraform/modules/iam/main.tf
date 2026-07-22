data "aws_iam_policy_document" "lambda_trust_policy" {
  statement {
    sid     = "AllowLambdaAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}







resource "aws_iam_role" "monitor_lambda" {
  name               = "${var.name_prefix}-monitor-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust_policy.json
  description        = "Execution role for Monitor Lambda. Grants HTTP check execution, Checks table write, SES send."

  tags = {
    Name     = "${var.name_prefix}-monitor-lambda-role"
    Function = "monitor-lambda"
  }
}


data "aws_iam_policy_document" "monitor_lambda_policy" {
  statement {
    sid    = "ReadActiveProjects"
    effect = "Allow"
    actions = [
      "dynamodb:Scan",
    ]
    resources = [
      var.projects_table_arn,
    ]
  }

  statement {
    sid    = "WriteAndReadChecks"
    effect = "Allow"
    actions = [
      "dynamodb:PutItem",
      "dynamodb:Query",   
    ]
    resources = [
      var.checks_table_arn,
    ]
  }

  
  statement {
    sid    = "SendAlertEmails"
    effect = "Allow"
    actions = [
      "ses:SendEmail",
      "ses:SendRawMessage",
    ]
    resources = ["*"]
  }


  statement {
    sid    = "ReadSsmParameters"
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters", 
    ]
    resources = [
      "arn:aws:ssm:${var.region}:${var.account_id}:parameter${var.ssm_parameter_prefix}"
    ]
  }
}




resource "aws_iam_policy" "monitor_lambda" {
  name        = "${var.name_prefix}-monitor-lambda-policy"
  policy      = data.aws_iam_policy_document.monitor_lambda_policy.json

  tags = {
    Name     = "${var.name_prefix}-monitor-lambda-policy"
  }
}

resource "aws_iam_role_policy_attachment" "monitor_lambda_custom" {
  role       = aws_iam_role.monitor_lambda.name
  policy_arn = aws_iam_policy.monitor_lambda.arn
}

# AWS-managed CloudWatch Logs policy for Lambda execution logging
resource "aws_iam_role_policy_attachment" "monitor_lambda_cloudwatch" {
  role       = aws_iam_role.monitor_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}










resource "aws_iam_role" "sla_processor_lambda" {
  name               = "${var.name_prefix}-processor-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust_policy.json

  tags = {
    Name     = "${var.name_prefix}-processor-lambda-role"
    Function = "sla-processor-lambda"
  }
}

data "aws_iam_policy_document" "sla_processor_lambda_policy" {
  statement {
    sid    = "ReadActiveProjects"
    effect = "Allow"
    actions = [
      "dynamodb:Scan",
    ]
    resources = [
      var.projects_table_arn,
    ]
  }


  statement {
    sid    = "ReadChecks"
    effect = "Allow"
    actions = [
      "dynamodb:Query",
    ]
    resources = [
      var.checks_table_arn,
    ]
  }

  statement {
    sid    = "ManageIncidents"
    effect = "Allow"
    actions = [
      "dynamodb:Query",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    ]
    resources = [
      var.incidents_table_arn,
    ]
  }
}

resource "aws_iam_policy" "sla_processor_lambda" {
  name        = "${var.name_prefix}-processor-lambda-policy"
  policy      = data.aws_iam_policy_document.sla_processor_lambda_policy.json

  tags = {
    Name     = "${var.name_prefix}-processor-lambda-policy"
    Function = "sla-processor-lambda"
  }
}

resource "aws_iam_role_policy_attachment" "sla_processor_lambda_custom" {
  role       = aws_iam_role.sla_processor_lambda.name
  policy_arn = aws_iam_policy.sla_processor_lambda.arn
}

resource "aws_iam_role_policy_attachment" "sla_processor_lambda_cloudwatch" {
  role       = aws_iam_role.sla_processor_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}












resource "aws_iam_role" "report_generator_lambda" {
  name               = "${var.name_prefix}-reporter-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust_policy.json
  description        = "Execution role for Report Generator Lambda. Reads all pipeline tables, writes Reports, S3, SES."

  tags = {
    Name     = "${var.name_prefix}-reporter-lambda-role"
    Function = "report-generator-lambda"
  }
}

data "aws_iam_policy_document" "report_generator_lambda_policy" {
  statement {
    sid    = "ReadActiveProjects"
    effect = "Allow"
    actions = [
      "dynamodb:Scan",
      # GetItem: on-demand and rebuild paths fetch a single project by id.
      "dynamodb:GetItem",
    ]
    resources = [
      var.projects_table_arn,
    ]
  }


  statement {
    sid    = "ReadChecks"
    effect = "Allow"
    actions = [
      "dynamodb:Query",
    ]
    resources = [
      var.checks_table_arn,
    ]
  }


  statement {
    sid    = "ReadIncidents"
    effect = "Allow"
    actions = [
      "dynamodb:Query",
    ]
    resources = [
      var.incidents_table_arn,
    ]
  }


  statement {
    sid    = "WriteReport"
    effect = "Allow"
    actions = [
      "dynamodb:PutItem",
      # GetItem: the rebuild path reads the stored report row to faithfully
      # re-render its S3 artifacts.
      "dynamodb:GetItem",
    ]
    resources = [
      var.reports_table_arn,
    ]
  }


  statement {
    sid    = "UploadToS3"
    effect = "Allow"
    actions = [
      "s3:PutObject",
    ]
    resources = [
      "${var.reports_bucket_arn}/reports/*", 
    ]
  }


  statement {
    sid    = "SendReportEmails"
    effect = "Allow"
    actions = [
      "ses:SendEmail",
      "ses:SendRawMessage",
    ]
    resources = ["*"]
  }


  statement {
    sid    = "ReadSsmParameters"
    effect = "Allow"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
    ]
    resources = [
      "arn:aws:ssm:${var.region}:${var.account_id}:parameter${var.ssm_parameter_prefix}"
    ]
  }
}

resource "aws_iam_policy" "report_generator_lambda" {
  name        = "${var.name_prefix}-reporter-lambda-policy"
  policy      = data.aws_iam_policy_document.report_generator_lambda_policy.json

  tags = {
    Name     = "${var.name_prefix}-reporter-lambda-policy"
    Function = "report-generator-lambda"
  }
}

resource "aws_iam_role_policy_attachment" "report_generator_lambda_custom" {
  role       = aws_iam_role.report_generator_lambda.name
  policy_arn = aws_iam_policy.report_generator_lambda.arn
}

resource "aws_iam_role_policy_attachment" "report_generator_lambda_cloudwatch" {
  role       = aws_iam_role.report_generator_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}









resource "aws_iam_role" "api_lambda" {
  name               = "${var.name_prefix}-api-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust_policy.json

  tags = {
    Name     = "${var.name_prefix}-api-lambda-role"
    Function = "api-lambda"
  }
}

data "aws_iam_policy_document" "api_lambda_policy" {

  statement {
    sid    = "ReadUserProfile"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
    ]
    resources = [
      var.users_table_arn,
    ]
  }

  statement {
    sid    = "ReadProjects"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:Query",
    ]
    resources = [
      var.projects_table_arn,
      var.projects_gsi_arn, # GSI access explicitly granted
    ]
  }

  statement {
    sid    = "ReadChecks"
    effect = "Allow"
    actions = [
      "dynamodb:Query",
    ]
    resources = [
      var.checks_table_arn,
    ]
  }


  statement {
    sid    = "ReadReports"
    effect = "Allow"
    actions = [
      "dynamodb:Query",
      "dynamodb:GetItem",
    ]
    resources = [
      var.reports_table_arn,
    ]
  }

  # Read report artifacts to serve pre-signed download URLs.
  statement {
    sid    = "DownloadReportFiles"
    effect = "Allow"
    actions = [
      "s3:GetObject",
    ]
    resources = [
      "${var.reports_bucket_arn}/reports/*",
    ]
  }

  # Self-heal missing report artifacts on download by asking the report generator
  # to rebuild them from the stored row.
  statement {
    sid    = "RebuildReportArtifacts"
    effect = "Allow"
    actions = [
      "lambda:InvokeFunction",
    ]
    resources = [
      "arn:aws:lambda:${var.region}:${var.account_id}:function:${var.name_prefix}-report-generator-lambda",
    ]
  }
}



resource "aws_iam_policy" "api_lambda" {
  name        = "${var.name_prefix}-api-lambda-policy"
  policy      = data.aws_iam_policy_document.api_lambda_policy.json

  tags = {
    Name     = "${var.name_prefix}-api-lambda-policy"
    Function = "api-lambda"
  }
}

resource "aws_iam_role_policy_attachment" "api_lambda_custom" {
  role       = aws_iam_role.api_lambda.name
  policy_arn = aws_iam_policy.api_lambda.arn
}


resource "aws_iam_role_policy_attachment" "api_lambda_cloudwatch" {
  role       = aws_iam_role.api_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}












resource "aws_iam_role" "project_manager_lambda" {
  name               = "${var.name_prefix}-project-manager-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_trust_policy.json
  description        = "Execution role for Project Manager Lambda. Read/write on Users and Projects tables only."

  tags = {
    Name     = "${var.name_prefix}-project-manager-lambda-role"
    Function = "project-manager-lambda"
  }
}



data "aws_iam_policy_document" "project_manager_lambda_policy" {
  
  statement {
    sid    = "ManageUserProfiles"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    ]
    resources = [
      var.users_table_arn,
    ]
  }


  statement {
    sid    = "ManageProjects"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
    ]
    resources = [
      var.projects_table_arn,
    ]
  }

  # Trigger on-demand report generation (async) for a single project.
  statement {
    sid    = "InvokeReportGenerator"
    effect = "Allow"
    actions = [
      "lambda:InvokeFunction",
    ]
    resources = [
      "arn:aws:lambda:${var.region}:${var.account_id}:function:${var.name_prefix}-report-generator-lambda",
    ]
  }
}

resource "aws_iam_policy" "project_manager_lambda" {
  name        = "${var.name_prefix}-project-manager-lambda-policy"
  policy      = data.aws_iam_policy_document.project_manager_lambda_policy.json

  tags = {
    Name     = "${var.name_prefix}-project-manager-lambda-policy"
    Function = "project-manager-lambda"
  }
}

resource "aws_iam_role_policy_attachment" "project_manager_lambda_custom" {
  role       = aws_iam_role.project_manager_lambda.name
  policy_arn = aws_iam_policy.project_manager_lambda.arn
}

resource "aws_iam_role_policy_attachment" "project_manager_lambda_cloudwatch" {
  role       = aws_iam_role.project_manager_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
