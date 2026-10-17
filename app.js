/**
 * CLOUD ASSIGNMENT MANAGER
 * A Cloud-based College Assignment Submission and Management System.
 *
 * Designed for Node.js, Express, Multer, Amazon S3, AWS EC2, and CloudWatch.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const helmet = require('helmet');
require('dotenv').config();

// AWS SDK v3 imports (only instantiated when STORAGE_MODE=s3 or on demand)
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration & Storage Mode
const STORAGE_MODE = (process.env.STORAGE_MODE || 'local').toLowerCase().trim();
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const S3_BUCKET = process.env.S3_BUCKET || 'cloud-assignment-manager-bucket-demo';

// File Paths
const UPLOAD_DIR = path.resolve(__dirname, 'uploads');
const DATA_DIR = path.resolve(__dirname, 'data');
const ASSIGNMENTS_FILE = path.join(DATA_DIR, 'assignments.json');
const SUBMISSIONS_FILE = path.join(DATA_DIR, 'submissions.json');

// Ensure necessary directories exist
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize Amazon S3 Client if configured for S3 mode
let s3Client = null;
if (STORAGE_MODE === 's3') {
  // Uses default AWS credential provider chain (IAM Role on EC2, or env vars if present)
  s3Client = new S3Client({
    region: AWS_REGION
  });
  console.log(`[Cloud Storage] Amazon S3 mode enabled. Target bucket: "${S3_BUCKET}" (Region: ${AWS_REGION})`);
} else {
  console.log('[Local Storage] Local filesystem mode enabled. Files stored in ./uploads');
}

// Security Headers using Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"]
      }
    }
  })
);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve static assets only from the public directory (never expose uploads directory)
app.use(express.static(path.join(__dirname, 'public')));

// Set View Engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ============================================================================
// DATA STORE HELPERS
// ============================================================================

function loadAssignments() {
  try {
    if (fs.existsSync(ASSIGNMENTS_FILE)) {
      const data = fs.readFileSync(ASSIGNMENTS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading assignments:', err.message);
  }
  return [];
}

function loadSubmissions() {
  try {
    if (fs.existsSync(SUBMISSIONS_FILE)) {
      const data = fs.readFileSync(SUBMISSIONS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading submissions:', err.message);
  }
  return [];
}

function saveSubmissions(submissions) {
  try {
    fs.writeFileSync(SUBMISSIONS_FILE, JSON.stringify(submissions, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error saving submissions:', err.message);
    return false;
  }
}

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// ============================================================================
// MULTER FILE UPLOAD & VALIDATION CONFIGURATION
// ============================================================================

const ALLOWED_EXTS = ['.pdf', '.doc', '.docx', '.zip'];
const ALLOWED_MIMES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream' // fallback sometimes sent by browsers on Windows
];

const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const rawExt = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_EXTS.includes(rawExt) ? rawExt : '.bin';
    const uniqueId = crypto.randomUUID();
    cb(null, `asg_${Date.now()}_${uniqueId}${safeExt}`);
  }
});

const upload = multer({
  storage: multerStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB maximum limit
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext)) {
      return cb(new Error(`Invalid file type "${ext}". Allowed types: PDF, DOC, DOCX, ZIP.`));
    }
    cb(null, true);
  }
});

/**
 * Deep File Signature (Magic Bytes) Verification
 * Validates actual binary headers to prevent file extension spoofing & reject executables.
 */
async function verifyFileSignature(filePath, ext) {
  const fd = await fs.promises.open(filePath, 'r');
  const buffer = Buffer.alloc(16);
  await fd.read(buffer, 0, 16, 0);
  await fd.close();

  // 1. Strict rejection of known executables & binary scripts
  // Windows Portable Executable (MZ)
  if (buffer[0] === 0x4D && buffer[1] === 0x5A) {
    throw new Error('Security Alert: Windows executable file (.exe/.dll) detected and rejected.');
  }
  // Linux ELF
  if (buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46) {
    throw new Error('Security Alert: Linux executable file (ELF) detected and rejected.');
  }
  // Unix shell script '#!'
  if (buffer[0] === 0x23 && buffer[1] === 0x21) {
    throw new Error('Security Alert: Executable script (#!) detected and rejected.');
  }
  // Java class file
  if (buffer[0] === 0xCA && buffer[1] === 0xFE && buffer[2] === 0xBA && buffer[3] === 0xBE) {
    throw new Error('Security Alert: Compiled Java class file detected and rejected.');
  }

  // 2. Validate expected format signatures
  if (ext === '.pdf') {
    // PDF starts with '%PDF'
    const header = buffer.subarray(0, 4).toString('ascii');
    if (header !== '%PDF') {
      throw new Error('Invalid file format: File header does not match valid PDF signature.');
    }
  } else if (ext === '.docx' || ext === '.zip') {
    // PKZip archives start with PK\x03\x04
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4B) {
      throw new Error(`Invalid file format: File header does not match valid ${ext.toUpperCase().slice(1)} archive.`);
    }
  } else if (ext === '.doc') {
    // Microsoft Word legacy compound document header: D0 CF 11 E0 A1 B1 1A E1
    const isDoc = buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0;
    if (!isDoc) {
      throw new Error('Invalid file format: File header does not match valid Microsoft Word (.doc) signature.');
    }
  }

  return true;
}

// ============================================================================
// APPLICATION ROUTES
// ============================================================================

/**
 * 1. Home Dashboard Route
 * GET /
 */
app.get('/', (req, res) => {
  const assignments = loadAssignments();
  const submissions = loadSubmissions();

  const totalAssignments = assignments.length;
  const totalFiles = submissions.length;
  const subjects = [...new Set(assignments.map((a) => a.subject))];

  // Most recent 5 submissions
  const recentFiles = [...submissions]
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
    .slice(0, 5);

  const activeAssignments = assignments.filter((a) => a.status === 'Active');

  res.render('index', {
    totalAssignments,
    totalFiles,
    totalSubjects: subjects.length,
    recentFiles,
    activeAssignments,
    storageMode: STORAGE_MODE,
    s3Bucket: S3_BUCKET,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

/**
 * 2. Assignments Catalog Route
 * GET /assignments
 */
app.get('/assignments', (req, res) => {
  const assignments = loadAssignments();
  const subjects = [...new Set(assignments.map((a) => a.subject))];

  res.render('assignments', {
    assignments,
    subjects,
    storageMode: STORAGE_MODE,
    s3Bucket: S3_BUCKET,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

/**
 * 3. Upload Assignment Page Route
 * GET /upload
 */
app.get('/upload', (req, res) => {
  const assignments = loadAssignments();
  const subjects = [...new Set(assignments.map((a) => a.subject))];

  res.render('upload', {
    assignments,
    subjects,
    selectedSubject: req.query.subject || '',
    selectedAssignmentTitle: req.query.assignmentTitle || '',
    storageMode: STORAGE_MODE,
    s3Bucket: S3_BUCKET,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

/**
 * 4. Process Assignment Upload Route
 * POST /upload
 */
app.post('/upload', (req, res) => {
  upload.single('assignmentFile')(req, res, async (err) => {
    // Handle Multer upload errors (size limit, file filter)
    if (err) {
      let errMsg = err.message;
      if (err.code === 'LIMIT_FILE_SIZE') {
        errMsg = 'File size exceeds maximum permitted limit of 5 MB.';
      }
      return res.redirect(`/upload?error=${encodeURIComponent(errMsg)}`);
    }

    if (!req.file) {
      return res.redirect('/upload?error=' + encodeURIComponent('Please select a file to upload.'));
    }

    const { studentName, rollNumber, subject, assignmentTitle } = req.body;

    // Validate required form fields
    if (!studentName || !rollNumber || !subject || !assignmentTitle) {
      // Clean up uploaded file if form validation fails
      if (fs.existsSync(req.file.path)) {
        await fs.promises.unlink(req.file.path).catch(() => {});
      }
      return res.redirect('/upload?error=' + encodeURIComponent('All form fields are required.'));
    }

    const ext = path.extname(req.file.originalname).toLowerCase();

    // Verify deep file signature (magic bytes)
    try {
      await verifyFileSignature(req.file.path, ext);
    } catch (sigErr) {
      // Delete malicious or invalid file immediately
      if (fs.existsSync(req.file.path)) {
        await fs.promises.unlink(req.file.path).catch(() => {});
      }
      console.warn(`[Security Alert] Rejected upload from "${studentName}": ${sigErr.message}`);
      return res.redirect(`/upload?error=${encodeURIComponent(sigErr.message)}`);
    }

    // Process storage: Local vs Amazon S3
    let s3Key = null;

    if (STORAGE_MODE === 's3') {
      try {
        if (!s3Client) {
          throw new Error('S3 Client is not initialized. Check AWS environment variables.');
        }

        const fileStream = fs.createReadStream(req.file.path);
        const year = new Date().getFullYear();
        s3Key = `submissions/${year}/${req.file.filename}`;

        const uploadCommand = new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: s3Key,
          Body: fileStream,
          ContentType: req.file.mimetype || 'application/octet-stream',
          Metadata: {
            'student-name': encodeURIComponent(studentName.trim()),
            'roll-number': encodeURIComponent(rollNumber.trim()),
            'subject': encodeURIComponent(subject.trim()),
            'original-filename': encodeURIComponent(req.file.originalname)
          }
        });

        await s3Client.send(uploadCommand);
        console.log(`[Amazon S3] Successfully uploaded "${req.file.originalname}" to s3://${S3_BUCKET}/${s3Key}`);

        // Remove temporary local file after successful S3 cloud upload
        await fs.promises.unlink(req.file.path).catch(() => {});
      } catch (s3Err) {
        // Clean up temp file on failure
        if (fs.existsSync(req.file.path)) {
          await fs.promises.unlink(req.file.path).catch(() => {});
        }
        console.error('[Amazon S3 Error]', s3Err.message);
        return res.redirect(
          `/upload?error=${encodeURIComponent(
            'Cloud Storage Error: Failed to upload file to Amazon S3. ' + s3Err.message
          )}`
        );
      }
    }

    // Save metadata record
    const newSubmission = {
      id: 'sub_' + crypto.randomUUID().slice(0, 8),
      studentName: studentName.trim(),
      rollNumber: rollNumber.trim().toUpperCase(),
      subject: subject.trim(),
      assignmentTitle: assignmentTitle.trim(),
      originalFilename: path.basename(req.file.originalname),
      storedFilename: req.file.filename,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      storageMode: STORAGE_MODE,
      s3Key: s3Key,
      uploadedAt: new Date().toISOString()
    };

    const submissions = loadSubmissions();
    submissions.push(newSubmission);
    saveSubmissions(submissions);

    const successMsg = `Assignment "${newSubmission.originalFilename}" submitted successfully via ${
      STORAGE_MODE === 's3' ? 'Amazon S3' : 'Local Storage'
    }!`;
    return res.redirect(`/files?success=${encodeURIComponent(successMsg)}`);
  });
});

/**
 * 5. Files Page Route
 * GET /files
 */
app.get('/files', (req, res) => {
  const submissions = loadSubmissions();

  // Format submission entries for display
  const formattedFiles = submissions
    .map((file) => ({
      ...file,
      formattedSize: formatBytes(file.fileSize)
    }))
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

  const totalBytes = submissions.reduce((sum, item) => sum + (item.fileSize || 0), 0);

  res.render('files', {
    files: formattedFiles,
    totalFormattedSize: formatBytes(totalBytes),
    storageMode: STORAGE_MODE,
    s3Bucket: S3_BUCKET,
    success: req.query.success || null,
    error: req.query.error || null
  });
});

/**
 * 6. Safe File Download Route
 * GET /files/download/:id
 * Prevents Directory Traversal & supports Amazon S3 presigned URLs
 */
app.get('/files/download/:id', async (req, res) => {
  const fileId = req.params.id;
  const submissions = loadSubmissions();
  const fileRecord = submissions.find((f) => f.id === fileId);

  if (!fileRecord) {
    return res.status(404).render('error', {
      statusCode: 404,
      title: 'Submission Record Not Found',
      message: `No assignment submission found with ID "${fileId}".`,
      storageMode: STORAGE_MODE,
      s3Bucket: S3_BUCKET
    });
  }

  // 1. Amazon S3 Download via short-lived Presigned URL
  if (fileRecord.storageMode === 's3' && fileRecord.s3Key) {
    try {
      if (!s3Client) {
        throw new Error('S3 Client is not configured. Verify AWS credentials and region.');
      }

      const getCommand = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: fileRecord.s3Key,
        ResponseContentDisposition: `attachment; filename="${encodeURIComponent(fileRecord.originalFilename)}"`
      });

      // Generate a presigned URL valid for 15 minutes (900 seconds)
      const presignedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 900 });
      return res.redirect(presignedUrl);
    } catch (s3Err) {
      console.error('[Amazon S3 Download Error]', s3Err.message);
      return res.status(500).render('error', {
        statusCode: 500,
        title: 'Cloud Download Error',
        message: `Could not generate S3 download link: ${s3Err.message}. Ensure the S3 bucket exists and AWS credentials have s3:GetObject permission.`,
        storageMode: STORAGE_MODE,
        s3Bucket: S3_BUCKET
      });
    }
  }

  // 2. Local File Download with strict Directory Traversal Protection
  const safeFilename = path.basename(fileRecord.storedFilename);
  const localFilePath = path.resolve(UPLOAD_DIR, safeFilename);

  // Assert that resolved path is strictly within UPLOAD_DIR
  if (!localFilePath.startsWith(UPLOAD_DIR)) {
    console.warn(`[Security Alert] Potential directory traversal attempt prevented for file: ${safeFilename}`);
    return res.status(403).render('error', {
      statusCode: 403,
      title: 'Access Forbidden',
      message: 'Directory traversal detected. Access to file outside uploads directory is forbidden.',
      storageMode: STORAGE_MODE,
      s3Bucket: S3_BUCKET
    });
  }

  if (!fs.existsSync(localFilePath)) {
    return res.status(404).render('error', {
      statusCode: 404,
      title: 'Physical File Missing',
      message: `The file "${fileRecord.originalFilename}" is recorded in metadata but could not be located in the local storage directory.`,
      storageMode: STORAGE_MODE,
      s3Bucket: S3_BUCKET
    });
  }

  // Send attachment with original student filename
  return res.download(localFilePath, fileRecord.originalFilename, (err) => {
    if (err && !res.headersSent) {
      console.error('Download error:', err.message);
      res.status(500).render('error', {
        statusCode: 500,
        title: 'Download Failed',
        message: 'An error occurred while streaming the file.',
        storageMode: STORAGE_MODE,
        s3Bucket: S3_BUCKET
      });
    }
  });
});

/**
 * 7. Friendly 404 Catch-All Route
 */
app.use((req, res) => {
  res.status(404).render('error', {
    statusCode: 404,
    title: 'Page Not Found',
    message: `The requested URL "${req.originalUrl}" does not exist on this server.`,
    storageMode: STORAGE_MODE,
    s3Bucket: S3_BUCKET
  });
});

/**
 * 8. Global Error Handler
 */
app.use((err, req, res, next) => {
  console.error('[Internal Error]', err);
  res.status(500).render('error', {
    statusCode: 500,
    title: 'Internal Server Error',
    message: 'An unexpected application error occurred. Please try again.',
    storageMode: STORAGE_MODE,
    s3Bucket: S3_BUCKET
  });
});

// ============================================================================
// START SERVER
// ============================================================================
app.listen(PORT, () => {
  console.log('====================================================');
  console.log(' CLOUD ASSIGNMENT MANAGER is running!');
  console.log(` - Local URL:      http://localhost:${PORT}`);
  console.log(` - Storage Mode:   ${STORAGE_MODE.toUpperCase()}`);
  if (STORAGE_MODE === 's3') {
    console.log(` - S3 Bucket:      ${S3_BUCKET}`);
    console.log(` - AWS Region:     ${AWS_REGION}`);
  } else {
    console.log(` - Local Storage:  ${UPLOAD_DIR}`);
  }
  console.log('====================================================');
});

module.exports = app;
