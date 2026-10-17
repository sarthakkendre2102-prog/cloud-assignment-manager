# CLOUD ASSIGNMENT MANAGER

> A secure, cloud-enabled college assignment submission and management platform built with **Node.js**, **Express.js**, **EJS**, **Multer**, and **AWS SDK for JavaScript v3**. Designed for dual-mode execution: 100% offline local development or enterprise cloud deployment with **Amazon S3**, **AWS EC2**, **AWS IAM**, and **Amazon CloudWatch**.

---

## 1. Abstract

**Cloud Assignment Manager** is a full-stack academic web application developed to modernize the assignment workflow in collegiate computer science education. It bridges the gap between traditional local submissions and scalable cloud architectures. The system allows students to view active coursework, submit assignments in standard formats (PDF, DOC, DOCX, ZIP) up to 5 MB, and verify submissions. Faculty can track submissions and download coursework. Crucially, the application provides an interchangeable storage abstraction: operating completely offline using a local filesystem or scaling dynamically to Amazon Simple Storage Service (S3) using private buckets and temporary presigned URLs, monitored through Amazon CloudWatch on AWS EC2.

---

## 2. Problem Statement

In academic environments, student assignment collection suffers from:
1. **Scattered Submissions**: Reliance on email attachments and ad-hoc shared drives leads to lost files and untracked timestamps.
2. **Security Vulnerabilities**: File upload portals frequently lack deep validation, permitting malicious executables disguised as documents (`.exe` renamed to `.pdf`), or permitting directory traversal attacks (`../../etc/passwd`).
3. **Storage Bottlenecks**: Storing gigabytes of student documents directly on web application disks creates disk exhaustion and backup failure.
4. **Cloud Complexity for Beginners**: Students and educators often struggle to learn cloud computing because starter projects tightly couple AWS services with hardcoded keys, risking accidental billing or security leaks.

**Cloud Assignment Manager** solves these issues by delivering a dual-mode system that runs immediately without an AWS account, while providing an industry-standard path to AWS S3, EC2, IAM, and CloudWatch.

---

## 3. Project Objectives

- Provide an intuitive, modern, responsive portal for students and faculty.
- Implement strict server-side file upload validation (file size constraints, extension filtering, MIME validation, and magic byte signature verification).
- Eliminate path traversal vulnerabilities during file storage and retrieval.
- Architect dual storage modes:
  - `STORAGE_MODE=local`: Works 100% offline with zero AWS credentials.
  - `STORAGE_MODE=s3`: Uses `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` to upload to private S3 buckets and generate short-lived signed URLs.
- Provide step-by-step production deployment blueprints for AWS EC2, IAM least-privilege policies, Nginx reverse proxying, and CloudWatch metrics.

---

## 4. Features

### Student & Faculty Experience
- **Interactive Dashboard**: Real-time counter cards for total assignments, uploaded files, registered subjects, and current storage engine status.
- **Coursework Catalog**: Rich listings for core subjects (**DBMS**, **Artificial Intelligence**, **Computer Networks**, **Cloud Computing**, **Operating Systems**) with due dates, instructor details, and point values.
- **One-Click Pre-filling**: Selecting "Submit" on an assignment automatically pre-populates the subject and title in the submission form.
- **Drag-and-Drop Submissions**: Modern drop zone with instant client-side size checking and file format preview.
- **File Explorer Table**: Filterable, searchable table displaying submission metadata (student name, roll number, submission date, file size, storage engine, and safe download button).

### Security & Architecture
- **Dual-Layer Validation**:
  - *Client-side*: Instant feedback for files over 5 MB or invalid extensions.
  - *Server-side*: Binary magic byte inspection (`%PDF`, `PK\x03\x04`, `0xD0 0xCF 0x11 0xE0`) to detect and reject executables (`MZ`, `ELF`, scripts).
- **Directory Traversal Protection**: Uses `path.basename` and `path.resolve` checks to ensure downloads never escape the designated storage directory.
- **Isolated Upload Directory**: Uploaded files are **never** exposed as raw static assets (`public/` only); all access flows through access-controlled controller routes.
- **Private Cloud Storage**: S3 buckets remain 100% private. Downloads use 15-minute cryptographically signed AWS S3 presigned URLs.
- **HTTP Security Headers**: Enforced via **Helmet** with fine-tuned Content Security Policy (CSP).

---

## 5. Technology Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Backend Runtime** | Node.js (v18+) | Server-side JavaScript runtime |
| **Web Framework** | Express.js (v4.x) | HTTP routing, middleware pipeline, error handling |
| **Templating Engine** | EJS (Embedded JavaScript) | Dynamic server-side HTML rendering |
| **File Handling** | Multer | Multipart/form-data upload processing |
| **Security Headers** | Helmet | Sets secure HTTP headers (`X-Frame-Options`, CSP, etc.) |
| **Configuration** | Dotenv | Zero-leak environment variable loading |
| **Cloud Storage** | AWS SDK for JavaScript v3 | S3 client (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`) |
| **Frontend Styling** | Custom CSS3 | Modern college blue-and-white theme, responsive grid |
| **Frontend Scripting**| Vanilla JavaScript | Live validation, search filters, modals, drag-and-drop |
| **Cloud Host** | AWS EC2 (Ubuntu 22.04 LTS)| Virtual machine application host |
| **Cloud Monitoring** | Amazon CloudWatch | System metrics, custom disk/memory alarms |

---

## 6. Architecture

### System Architecture Diagram

```
                 +-------------------------------------------------------------+
                 |                       CLIENT BROWSER                        |
                 |      (Desktop / Tablet / Smartphone - Responsive Web UI)    |
                 +------------------------------+------------------------------+
                                                |
                                      HTTP / HTTPS (Port 80/443)
                                                |
                                                v
                 +-------------------------------------------------------------+
                 |            NGINX REVERSE PROXY (Production EC2)            |
                 |      - SSL / TLS Termination (Let's Encrypt Certbot)        |
                 |      - Forwards requests to 127.0.0.1:3000                  |
                 +------------------------------+------------------------------+
                                                |
                                         Internal Port 3000
                                                |
                                                v
+-----------------------------------------------------------------------------------------------+
| NODE.JS & EXPRESS APPLICATION (Managed via PM2 on EC2)                                        |
|                                                                                               |
|  +--------------------+    +---------------------+    +-------------------+                   |
|  | Helmet Security    | -> | Body / Query Parser | -> | Multer Uploader   |                   |
|  +--------------------+    +---------------------+    +---------+---------+                   |
|                                                                 |                             |
|                                                     5MB Limit & Magic Bytes                   |
|                                                                 v                             |
|                                                   +---------------------------+               |
|                                                   | verifyFileSignature()     |               |
|                                                   | Rejects MZ, ELF, Scripts  |               |
|                                                   +-------------+-------------+               |
|                                                                 |                             |
+-----------------------------------------------------------------|-----------------------------+
                                                                  |
                                       STORAGE_MODE Dispatcher ---+
                                      /                            \
                        STORAGE_MODE=local                      STORAGE_MODE=s3
                                    /                                \
                                   v                                  v
         +----------------------------------+       +------------------------------------+
         | LOCAL FILE SYSTEM                |       | AMAZON SIMPLE STORAGE SERVICE (S3) |
         |                                  |       |                                    |
         | Target: uploads/                 |       | Bucket: Private S3 Bucket          |
         | Metadata: data/submissions.json  |       | Auth: EC2 Attached IAM Role        |
         | Download: path.resolve check     |       | Download: 15-Min Presigned URL     |
         +----------------------------------+       +------------------------------------+
                                                                      ^
                                                                      |
                                                            Amazon CloudWatch
                                                  (Monitors CPU, Disk, Memory & Logs)
```

---

## 7. Project Structure

```
cloud-assignment-manager/
│
├── app.js                   # Primary Express application and route handlers
├── package.json             # Project dependencies and operational scripts
├── .gitignore               # Excludes node_modules, .env, and local uploads
├── .env.example             # Template for configuration environment variables
├── .env                     # Local active environment variables (untracked)
├── test_routes.js           # Automated integration and security test suite
├── README.md                # Comprehensive documentation
│
├── data/                    # Lightweight persistent metadata store
│   ├── assignments.json     # Sample computer science course assignments
│   └── submissions.json     # Persistent submission records (preserves state across reboots)
│
├── views/                   # EJS templates
│   ├── index.ejs            # Home dashboard with statistics and recent activity
│   ├── assignments.ejs      # Course assignments catalog with subject filters & modal
│   ├── upload.ejs           # Assignment upload form with drag-and-drop zone
│   ├── files.ejs            # Submissions file explorer with safe download actions
│   ├── error.ejs            # User-friendly 404 & error handling page
│   └── partials/
│       ├── header.ejs       # Responsive navigation bar and cloud status badge
│       └── footer.ejs       # Footer with technology tags and script references
│
├── public/                  # Public web assets (only static assets, never uploads)
│   ├── style.css            # Professional blue-and-white college theme
│   └── script.js            # Client-side validation, drag-and-drop, filters, modal
│
└── uploads/                 # Local storage directory for student files
    ├── .gitkeep             # Preserves folder structure in Git
    └── sample_cloud_report.pdf # Starter sample submission file
```

---

## 8. Installation Steps

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Git**: Installed on your operating system

### Step 1: Clone the Repository
```bash
git clone https://github.com/your-username/cloud-assignment-manager.git
cd cloud-assignment-manager
```

### Step 2: Install Node.js Dependencies
```bash
npm install
```

---

## 9. Dependencies

| Package | Version | Justification |
| :--- | :--- | :--- |
| `express` | `^4.21.2` | Fast, unopinionated web framework for Node.js |
| `ejs` | `^3.1.10` | Server-rendered templates supporting clean partials |
| `multer` | `^1.4.5-lts.1` | Efficient multipart/form-data upload handling |
| `helmet` | `^8.0.0` | Comprehensive HTTP security header protection |
| `dotenv` | `^16.4.7` | Loads environment variables safely from `.env` |
| `@aws-sdk/client-s3` | `^3.750.0` | Official AWS SDK v3 client for Amazon S3 |
| `@aws-sdk/s3-request-presigner` | `^3.750.0` | Generates short-lived presigned download URLs |
| `nodemon` *(dev)* | `^3.1.9` | Auto-restarts server on code edits during development |

---

## 10. Local Execution Steps (100% Offline, No AWS Account Needed)

The application is pre-configured to run locally out-of-the-box.

### 1. Configure Local Environment
Ensure your `.env` file contains:
```env
PORT=3000
STORAGE_MODE=local
```

### 2. Run the Automated Test Suite
Verify that all routes, templates, upload handlers, and executable blocking algorithms pass:
```bash
npm test
```
*Expected output: `ALL 9 INTEGRATION SMOKE TESTS PASSED!`*

### 3. Launch the Application
- **Production mode**:
  ```bash
  npm start
  ```
- **Development mode (with auto-reload)**:
  ```bash
  npm run dev
  ```

### 4. Open in Your Browser
Navigate to:
```
http://localhost:3000
```
- Browse assignments under `/assignments`.
- Upload a file (PDF, DOC, DOCX, ZIP) under `/upload`.
- Verify the file appears and is downloadable under `/files`.

---

## 11. Environment Variables

Create a `.env` file in the project root based on `.env.example`:

```env
# Server Port (defaults to 3000 if not specified)
PORT=3000

# Storage Engine: 'local' or 's3'
# Set to 'local' for zero-cloud offline execution
STORAGE_MODE=local

# Amazon S3 Settings (Required only when STORAGE_MODE=s3)
AWS_REGION=us-east-1
S3_BUCKET=my-college-assignment-bucket

# Local AWS Testing Credentials (OPTIONAL)
# On AWS EC2, LEAVE THESE COMMENTED OUT to use the attached IAM Role!
# AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
# AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

---

## 12. Amazon S3 Setup & Integration

To transition from local disk storage to Amazon S3:

### Step 1: Create a Private S3 Bucket
1. Open the [AWS S3 Console](https://s3.console.aws.amazon.com/).
2. Click **Create bucket**.
3. Bucket name: Choose a globally unique name (e.g., `cloud-assignment-manager-college-2026`).
4. Region: Choose your preferred AWS Region (e.g., `us-east-1`).
5. **Block Public Access**: Ensure **"Block all public access"** is checked. **Never make the bucket public.**
6. **Default Encryption**: Enable Server-side encryption (SSE-S3 / AES-256).
7. Click **Create bucket**.

Using AWS CLI:
```bash
aws s3api create-bucket \
    --bucket cloud-assignment-manager-college-2026 \
    --region us-east-1
```

### Step 2: Switch Storage Mode in `.env`
Update your `.env`:
```env
STORAGE_MODE=s3
S3_BUCKET=cloud-assignment-manager-college-2026
AWS_REGION=us-east-1
```

### Step 3: Presigned URL Architecture
Because the S3 bucket is strictly private, files cannot be accessed via public links. When a user clicks **Download**, `app.js` runs:
```javascript
const command = new GetObjectCommand({
  Bucket: S3_BUCKET,
  Key: fileRecord.s3Key,
  ResponseContentDisposition: `attachment; filename="${encodeURIComponent(fileRecord.originalFilename)}"`
});
const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
return res.redirect(presignedUrl);
```
This generates a temporary, cryptographically signed URL valid for exactly **15 minutes (900 seconds)**, protecting intellectual property and preventing bandwidth leeching.

---

## 13. AWS IAM Permissions (Least-Privilege Principle)

Never hardcode AWS Access Keys into code or commit `.env` with secrets to GitHub. When running on AWS EC2, the application automatically uses the **AWS Default Credential Provider Chain** to assume an IAM Role attached directly to the instance.

### Step 1: Create the IAM Policy
In the AWS IAM Console, create a policy named `CloudAssignmentManagerS3Policy`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AssignmentBucketObjectAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::cloud-assignment-manager-college-2026/*"
    },
    {
      "Sid": "AssignmentBucketListAccess",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::cloud-assignment-manager-college-2026"
    }
  ]
}
```

### Step 2: Create IAM Role for EC2
1. Go to **IAM Console > Roles > Create Role**.
2. Select **AWS Service** and choose **EC2**.
3. Attach policies:
   - `CloudAssignmentManagerS3Policy` (created above)
   - `CloudWatchAgentServerPolicy` (AWS managed, for CloudWatch metrics)
4. Name the role: `EC2-CloudAssignmentManager-Role`.
5. Click **Create Role**.

---

## 14. AWS EC2 Production Deployment

### Step 1: Launch an EC2 Instance
- **AMI**: Ubuntu Server 22.04 LTS (HVM), SSD Volume Type
- **Instance Type**: `t3.micro` or `t2.micro` (Free Tier eligible)
- **Key Pair**: Select or generate an SSH key pair (`.pem`)

### Step 2: Configure EC2 Security Group
Do **NOT** expose internal application port 3000 to the public internet. Only allow HTTP, HTTPS, and your specific IP for SSH:

| Type | Protocol | Port Range | Source | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **SSH** | TCP | 22 | `My IP` (e.g. `203.0.113.5/32`) | Secure server administration |
| **HTTP** | TCP | 80 | `0.0.0.0/0` | Public web traffic (redirected to 443) |
| **HTTPS**| TCP | 443 | `0.0.0.0/0` | Encrypted web traffic |

### Step 3: Attach the IAM Role to EC2
1. In the EC2 Console, select your instance.
2. Click **Actions > Security > Modify IAM role**.
3. Select `EC2-CloudAssignmentManager-Role` and click **Update IAM role**.

### Step 4: Server Setup & Code Deployment
Connect via SSH:
```bash
ssh -i your-key.pem ubuntu@<your-ec2-public-ip>
```

Install Node.js 20 and PM2:
```bash
# Update Ubuntu packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git nginx

# Install PM2 process manager globally
sudo npm install -g pm2
```

Clone and configure the application:
```bash
cd /var/www
sudo git clone https://github.com/your-username/cloud-assignment-manager.git
sudo chown -R ubuntu:ubuntu cloud-assignment-manager
cd cloud-assignment-manager

# Install production dependencies
npm install --omit=dev

# Configure production .env
cat << 'EOF' > .env
PORT=3000
STORAGE_MODE=s3
AWS_REGION=us-east-1
S3_BUCKET=cloud-assignment-manager-college-2026
EOF
```

### Step 5: Run with PM2 Process Manager
PM2 ensures the Node.js application auto-restarts on unexpected crashes and resumes automatically across server reboots:
```bash
# Start application
pm2 start app.js --name "cloud-assignment-manager"

# Save process list
pm2 save

# Enable startup on system boot
pm2 startup systemd
# (Run the generated sudo command displayed in the console)
```

### Step 6: Configure Nginx as Reverse Proxy
Never expose port 3000 directly. Configure Nginx to proxy port 80/443 to `127.0.0.1:3000` with 10MB client body limit:

Create `/etc/nginx/sites-available/assignment-manager`:
```nginx
server {
    listen 80;
    server_name your-college-domain.edu; # or your EC2 Public IP

    # Support up to 10MB uploads (Multer enforces 5MB application limit)
    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/assignment-manager /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

### Step 7: Secure with Free HTTPS via Let's Encrypt
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-college-domain.edu
```

---

## 15. Amazon CloudWatch Monitoring

Monitoring ensures optimal availability, tracking CPU spikes during batch submissions and preventing disk exhaustion.

### 1. Default Standard Metrics
AWS CloudWatch collects basic hypervisor-level metrics automatically every 5 minutes at no extra cost:
- `CPUUtilization`: Percent of allocated EC2 compute consumed.
- `NetworkIn` / `NetworkOut`: Volume of inbound submission traffic.
- `StatusCheckFailed_Instance` / `StatusCheckFailed_System`: Health checks.

### 2. High-Resolution Memory & Disk Monitoring (CloudWatch Agent)
Standard EC2 metrics do not track OS-level RAM or disk storage. To track these:

Install the CloudWatch unified agent on Ubuntu:
```bash
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i -E ./amazon-cloudwatch-agent.deb
```

Create `/opt/aws/amazon-cloudwatch-agent/bin/config.json`:
```json
{
  "metrics": {
    "metrics_collected": {
      "mem": {
        "measurement": [
          "mem_used_percent"
        ],
        "metrics_collection_interval": 60
      },
      "disk": {
        "measurement": [
          "disk_used_percent"
        ],
        "metrics_collection_interval": 60,
        "resources": [
          "/"
        ]
      }
    }
  }
}
```

Start the agent:
```bash
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config \
    -m ec2 \
    -c file:/opt/aws/amazon-cloudwatch-agent/bin/config.json \
    -s
```

### 3. Creating CloudWatch Metric Alarms
Configure an alarm in the CloudWatch console to notify via Amazon SNS email when CPU utilization exceeds 85% for two consecutive 5-minute periods:
```bash
aws cloudwatch put-metric-alarm \
    --alarm-name "High-CPU-CloudAssignmentManager" \
    --metric-name CPUUtilization \
    --namespace AWS/EC2 \
    --statistic Average \
    --period 300 \
    --threshold 85 \
    --comparison-operator GreaterThanOrEqualToThreshold \
    --dimensions Name=InstanceId,Value=<YOUR_INSTANCE_ID> \
    --evaluation-periods 2 \
    --alarm-actions arn:aws:sns:us-east-1:<ACCOUNT_ID>:college-devops-alerts
```

---

## 16. GitHub Upload & Repository Instructions

Follow these exact steps to publish this repository cleanly without leaking files or personal student submissions:

```bash
# 1. Initialize git (if not already initialized)
git init

# 2. Verify .gitignore ignores .env and uploaded student files
git status

# 3. Add all project files
git add .

# 4. Commit code
git commit -m "feat: complete cloud assignment manager with local and AWS S3 storage"

# 5. Link to your GitHub repository
git remote add origin https://github.com/<your-username>/cloud-assignment-manager.git
git branch -M main

# 6. Push to GitHub
git push -u origin main
```

---

## 17. Application Screenshots & Walkthrough

| Screen | Description |
| :--- | :--- |
| **1. Dashboard (`/`)** | Metric summary cards (Total Coursework, Submitted Files, Registered Subjects, Active Storage engine badge) and recent submissions table. |
| **2. Coursework Catalog (`/assignments`)** | Grid cards for DBMS, AI, Computer Networks, and Cloud Computing with modal popups and one-click submit actions. |
| **3. Submission Form (`/upload`)** | Clean form with drag-and-drop file target, live 5 MB limit validator, and auto-populated subject dropdowns. |
| **4. Files Explorer (`/files`)** | Searchable submission records with instant file download links, roll numbers, file formats, and S3 badges. |

---

## 18. Limitations and Future Scope

### Current Limitations
- **Demonstration Authentication**: Student name and roll number are entered manually for academic demonstration purposes. Real-world systems require federated single sign-on (SSO).
- **In-Memory / JSON Data Store**: Assignment metadata is stored in lightweight JSON files. While resilient across server restarts, high-concurrency deployments benefit from a relational or NoSQL database.
- **Single S3 Bucket**: All files are stored under `submissions/<year>/` prefixes rather than dedicated multi-tenant prefixes.

### Future Enhancements
- **AWS Cognito Authentication**: Integrate Amazon Cognito user pools for student and faculty OAuth2 / JWT authentication with role-based access control (RBAC).
- **Amazon DynamoDB / Amazon RDS**: Migrate metadata records to Amazon DynamoDB or Amazon RDS PostgreSQL with Multi-AZ replication.
- **AWS Lambda Anti-Virus Scanning**: Hook S3 `ObjectCreated` events to AWS Lambda running ClamAV to scan uploaded PDFs and ZIPs for zero-day malware.
- **Auto Scaling & Application Load Balancer**: Deploy across multiple Availability Zones with an AWS Application Load Balancer (ALB) and EC2 Auto Scaling group.

---

## 19. Academic Project Disclaimer

> **Notice**: This project was developed as an educational demonstration of full-stack engineering and cloud computing principles. It is **not** currently certified for production deployment with sensitive or FERPA-regulated student data without implementing authenticated role-based access control, automated malware scanning, and encrypted database persistence.
