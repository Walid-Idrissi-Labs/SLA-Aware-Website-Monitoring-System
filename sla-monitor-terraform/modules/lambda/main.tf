#package source code to zip
data "archive_file" "lambda_zip" {
  type = "zip"

  source_dir = var.source_dir

  output_path = "${path.module}/tmp/${var.function_name}.zip"
}



#upload zip to s3
resource "aws_s3_object" "lambda_zip" {
  bucket = var.artifacts_bucket_name
  #object path
  key    = "lambda/${var.function_name}/${data.archive_file.lambda_zip.output_base64sha256}.zip"
  source = data.archive_file.lambda_zip.output_path


  etag = filemd5(data.archive_file.lambda_zip.output_path)

  tags = {
    FunctionName = var.function_name
    Description  = "Deployment package for ${var.function_name}"
  }
}



resource "aws_cloudwatch_log_group" "lambda_logs" {
  #where Lambda logs are stored
  name = "/aws/lambda/${var.function_name}"


  retention_in_days = var.log_retention_days

  tags = {
    FunctionName = var.function_name
    Description  = "Execution logs for ${var.function_name}"
  }
}



#create lambda function(s)
resource "aws_lambda_function" "this" {
  function_name = var.function_name
  description   = var.description


  #one role per function
  role = var.role_arn

  runtime = var.runtime

  # function that Lambda calls when invoked
  handler = var.handler


  s3_bucket = var.artifacts_bucket_name
  s3_key    = aws_s3_object.lambda_zip.key
  #the SHA256 hash of the ZIP file contents 
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256


  memory_size = var.memory_mb
  timeout = var.timeout_seconds

  # injected into the Lambda runtime
  dynamic "environment" {
    #empty environment block is invalid in Terraform
    for_each = length(var.environment_variables) > 0 ? [1] : []

    content {
      variables = var.environment_variables
    }
  }

  #X-Ray active tracing disabled
  tracing_config {
    mode = "PassThrough"
  }








  depends_on = [
    aws_s3_object.lambda_zip,         
    aws_cloudwatch_log_group.lambda_logs, 
  ]

  tags = {
    FunctionName = var.function_name
    Description  = var.description
  }
}








resource "aws_lambda_permission" "eventbridge" {

  count = length(var.eventbridge_rule_arns)

  statement_id = "AllowEventBridgeInvoke-${count.index}"

  action = "lambda:InvokeFunction"

  function_name = aws_lambda_function.this.function_name

  principal = "events.amazonaws.com"

  source_arn = var.eventbridge_rule_arns[count.index]
}



resource "aws_lambda_permission" "api_gateway" {
  count = var.api_gateway_execution_arn != "" ? 1 : 0

  statement_id = "AllowAPIGatewayInvoke"
  action       = "lambda:InvokeFunction"

  function_name = aws_lambda_function.this.function_name

  principal = "apigateway.amazonaws.com"

  source_arn = var.api_gateway_execution_arn
}