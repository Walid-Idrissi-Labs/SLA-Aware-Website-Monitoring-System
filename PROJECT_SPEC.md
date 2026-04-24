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

- **Uptime (%)**
    - uptime = (successful checks / total checks) * 100
- **Average Latency**
- **(Optional) p95 Latency**
- **Incident Count**
- **Total Downtime**
- **Longest Incident Duration**
- **Mean time to Recovery**
- **Resolution Time**

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
- SLA threshold breach

Delivery:
- Email (via AWS SES or SNS)

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
- Optional API via API Gateway

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

#### 3. DynamoDB (Database)

##### Table: `Checks`
Stores raw monitoring data
- project_id (PK)
- timestamp (SK)
- status (success/fail)
- latency_ms
- status_code


---

##### Table: `Incidents`
- incident_id (PK)
- project_id
- start_time
- end_time
- duration


---

##### Table: `Reports`

- report_id (PK)
- project_id
- time_window
- uptime
- avg_latency
- incident_count
- total_downtime
- severity
- sla_pass (boolean)


---

#### 4. SNS / SES
- Sends email alerts and reports to users

---

#### 5. S3
- Hosts:
  - Static dashboard
  - SLA reports (JSON/HTML)

---

#### 6. API Gateway (Optional)
- Exposes endpoints:
  - Get projects
  - Get reports
  - Get current status

---

#### 7. Terraform (Infrastructure as Code)

Manages all infrastructure:

- Lambda functions
- IAM roles
- DynamoDB tables
- EventBridge rules
- SNS/SES configuration
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

## 6. Project Scope 

### Must-Have

- Monitoring Lambda
- DynamoDB storage
- SLA computation (basic)
- Weekly report generation
- Email alerts
- Terraform setup

---

### Optional 

- Dashboard UI
- p95 latency calculation
- Multi-region checks
- Content validation
- Public status page

---

## 7. Design Principles

- **Simplicity first**: avoid overengineering
- **Single responsibility per Lambda**
- **Data-driven architecture**
- **SLA as the main output**
- **Cloud-native design**
- **Full infrastructure automation via Terraform**

---

## 8. Why This Project is Strong

- Demonstrates real-world problem solving
- Combines:
  - Cloud Computing
  - Backend Engineering
  - Observability concepts
- Shows understanding of:
  - Metrics vs insights
  - Reliability engineering basics
  - Data modeling
- Produces a tangible, useful output (SLA reports)

---

## 9. Possible Extensions (Future Work)

- Multi-region monitoring
- Authentication & multi-user support
- Slack/Discord alerts
- Advanced anomaly detection
- Historical trend visualization
- Integration with CI/CD pipelines

---

## 10. Summary

This project is a **cloud-based SLA monitoring system** that:

- Collects performance data from websites
- Processes it into meaningful metrics
- Evaluates service reliability
- Generates structured reports
- Alerts users when issues arise

It is designed to be:
- Practical
- Scalable in concept
- Achievable in ~1 week
- Highly valuable for a portfolio

---