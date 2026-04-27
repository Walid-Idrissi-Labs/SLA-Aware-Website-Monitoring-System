---
title: SLA-Aware Website Monitoring System

---

---
title: SLA-Aware Website Monitoring System

---

# SLA-Aware Website Monitoring System (AWS + Terraform)

## 1. Project Overview

This project is a **cloud-native website/API monitoring system** whose primary purpose is not just to detect downtime, but to **generate structured SLA (Service Level Agreement) reports** based on real performance data.

### Core Idea

> Continuously monitor websites → collect metrics → process them → generate SLA reports with severity classification.

This transforms raw monitoring data into **actionable insights**, which is the main differentiator of the project.

---

## 2. Objectives

- Monitor availability and latency of websites/APIs
- Store time-series monitoring data
- Detect incidents (downtime or degradation)
- Compute SLA metrics (uptime, latency, downtime, etc.)
- Classify system health using severity levels
- Generate periodic SLA reports
- Send alerts when issues occur
- Showcase AWS + Terraform skills in a practical system

---

## 3. Key Features

### 3.1 Monitoring (Data Collection)

Each monitored project will:

- Perform periodic HTTP checks
- Measure:
  - Response status (success/failure)
  - HTTP status code
  - Latency (ms)
  - Optional: content validation (keyword check)

- Store every result in a database

---

### 3.2 Incident Detection

An **incident** is defined as:

- Multiple consecutive failures (e.g., 3 failed checks)

Each incident includes:
- Start time
- End time
- Duration (used for Mean-time-to-recovery SLA Metric Calculation)

---

### 3.3 SLA Engine (Core Component)

The system computes SLA metrics over time windows (daily/weekly):

#### Metrics

- Availability
	- **Uptime (%)**
	- **Total Downtime**
- Reliability 
	- **Incident Count**
	- **Longuest Incident Duration**
	- **MTTR Mean Time to Recovery**
	- **MTBF Mean Time Between Failures**
- Performance 
	- **Average Response Time**
	- **Percentile Response Time  (p50 , p95 , p99)**
- Quality
	- **Error Rate (%)**


---

### 3.4 SLA Evaluation

Each project defines thresholds:

Example:
- Uptime ≥ 99.9%
- Avg Latency ≤ 300ms

The system evaluates:
- SLA Pass / Fail
- Severity level

---

### 3.5 Severity Levels

| Level        | Meaning                              |
|-------------|--------------------------------------|
| 🟢 Healthy   | SLA fully met                        |
| 🟡 Degraded  | Minor issues (latency or small dips) |
| 🟠 Major     | Noticeable SLA violation             |
| 🔴 Critical  | Severe downtime or failure           |

---

### 3.6 Reporting System (Main Output)

Generate **weekly SLA reports** containing:

- Uptime %
- Average latency
- Incident count
- Total downtime
- Worst latency spike
- SLA status (pass/fail)
- Severity level

Formats:
- JSON (primary)
- Optional: HTML (for presentation)

---

### 3.7 Alerting System

Alerts are triggered on:

- Status change (UP → DOWN, DOWN → UP)
- Incident start/end

Delivery:
- Email (via AWS SES)

---

### 3.8 Dashboard 

Displays:

- Current status of all projects
- Last check result
- Uptime %
- Recent incidents
- Latest SLA report

Implementation:
- Static frontend hosted on S3
- API via API Gateway

---

## 4. AWS Architecture

### Core Services

#### 1. EventBridge (Scheduler)
- Triggers monitoring and processing jobs at fixed intervals

---

#### 2. AWS Lambda (Core Logic)

##### A. Monitor Lambda
- Executes HTTP checks
- Measures latency
- Determines success/failure
- Stores result in database

---

##### B. SLA Processor Lambda
- Runs periodically (e.g., hourly/daily)
- Aggregates monitoring data
- Computes SLA metrics
- Detects incidents

---

##### C. Report Generator Lambda
- Runs weekly
- Generates SLA reports
- Evaluates SLA thresholds
- Assigns severity level
- Sends report via email

---

##### D. API Lambda
- Handles Read-only Routes

---

##### E. Projects CRUD Lambda
- Handles users adding projects

#### 3. DynamoDB (Database)



---

##### Table: sla_monitor_users

- user_id (PK)
- email
- display_name
- notification_email
- created_at

---

##### Table: sla_monitor_projects

- project_id (PK)
- user_id (FK)
- name
- url
- active
- failure_threshold
- thresholds
- notification_email
- created_at

---

##### Table: sla_monitor_checks

- project_id (PK)
- timestamp (SK)
- status
- latency_ms
- http_status_code
- ttl

---

##### Table: sla_monitor_incidents

- project_id (PK)
- start_time (SK)
- end_time
- duration_seconds
- resolved

---

##### Table: sla_monitor_reports

- project_id (PK)
- report_id (SK)
- uptime_pct
- avg_latency_ms
- p95_latency_ms
- incident_count
- total_downtime_sec
- severity
- sla_pass
- generated_at

---

#### 4. SES
- Sends email alerts and reports to users

---

#### 5. S3
- Hosts:
  - Static dashboard
  - SLA reports (JSON/HTML)

---

#### 6. API Gateway
- Exposes endpoints:
  - Get projects
  - Get reports
  - Get current status
##### Routes 
- PUBLIC
	- GET  /health

- USER
	- GET /me
	- PUT /me

- PROJECTS
	- GET /projects
	- POST /projects
	- PUT /projects/{project_id}
	- DELETE /projects/{project_id}

- DATA
	- GET /projects/{project_id}/status
	- GET /projects/{project_id}/reports


---

#### 7. CloudFront
- Cache and Display Dashboard Website for Users
	- Cached and Served to CDNs from S3 Bucket storing static website

#### 8. Cognito (User Pool)
- Allow users Login via Email or Google OAuth


#### 9. Terraform (Infrastructure as Code)
- State Stored in Terraform Cloud

Manages all infrastructure:

- Lambda functions
- IAM roles
- DynamoDB tables
- EventBridge rules
- SES configuration
- API Gateway
- S3 bucket

---


## 5. System Flow

### Step 1: Monitoring

1. EventBridge triggers Monitor Lambda
2. Lambda:
   - Sends HTTP request
   - Measures latency
   - Determines status
3. Result stored in `Checks` table

---

### Step 2: Incident Detection

- Analyze consecutive failures
- If threshold exceeded:
  - Create incident
- If recovery:
  - Close incident

---

### Step 3: SLA Processing

1. SLA Processor Lambda runs
2. Fetches recent check data
3. Computes:
   - Uptime
   - Latency stats
   - Incident metrics
4. Stores aggregated results

---

### Step 4: Report Generation

1. Weekly trigger activates Report Lambda
2. Aggregates SLA data
3. Evaluates thresholds
4. Assigns severity
5. Stores report
6. Sends email notification

---

### Step 5: Dashboard 

- Frontend fetches:
  - Current status
  - Reports
- Displays system health visually

---

## 6. Summary

This project is a **cloud-based SLA monitoring system** that:

- Collects performance data from websites
- Processes it into meaningful metrics
- Evaluates service reliability
- Generates structured reports
- Alerts users when issues arise

