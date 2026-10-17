const http = require('http');
const fs = require('fs');
const path = require('path');
const app = require('./app');

const server = http.createServer(app);

server.listen(0, async () => {
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  function fetchUrl(urlPath, options = {}) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(urlPath, baseUrl);
      const req = http.request(parsedUrl, options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      });
      req.on('error', reject);
      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }

  try {
    // 1. Test GET /
    console.log('Testing GET / ...');
    const resHome = await fetchUrl('/');
    if (resHome.status !== 200 || !resHome.body.includes('CLOUD ASSIGNMENT MANAGER')) {
      throw new Error(`GET / failed with status ${resHome.status}`);
    }
    console.log('✓ GET / passed (200 OK)');

    // 2. Test GET /assignments
    console.log('Testing GET /assignments ...');
    const resAsg = await fetchUrl('/assignments');
    if (resAsg.status !== 200 || !resAsg.body.includes('Course Assignments')) {
      throw new Error(`GET /assignments failed with status ${resAsg.status}`);
    }
    console.log('✓ GET /assignments passed (200 OK)');

    // 3. Test GET /upload
    console.log('Testing GET /upload ...');
    const resUpload = await fetchUrl('/upload');
    if (resUpload.status !== 200 || !resUpload.body.includes('Submit Course Assignment')) {
      throw new Error(`GET /upload failed with status ${resUpload.status}`);
    }
    console.log('✓ GET /upload passed (200 OK)');

    // 4. Test GET /files
    console.log('Testing GET /files ...');
    const resFiles = await fetchUrl('/files');
    if (resFiles.status !== 200 || !resFiles.body.includes('Submitted Assignment Files')) {
      throw new Error(`GET /files failed with status ${resFiles.status}`);
    }
    console.log('✓ GET /files passed (200 OK)');

    // 5. Test GET /files/download/sub_sample_101
    console.log('Testing GET /files/download/sub_sample_101 ...');
    const resDownload = await fetchUrl('/files/download/sub_sample_101');
    if (resDownload.status !== 200 || !resDownload.headers['content-disposition']) {
      throw new Error(`Download test failed with status ${resDownload.status}`);
    }
    console.log('✓ GET /files/download/sub_sample_101 passed (200 OK, attachment delivered)');

    // 6. Test 404 for non-existent file
    console.log('Testing 404 for invalid file download ...');
    const resInvalidFile = await fetchUrl('/files/download/nonexistent999');
    if (resInvalidFile.status !== 404) {
      throw new Error(`Expected 404, got ${resInvalidFile.status}`);
    }
    console.log('✓ 404 for invalid file passed');

    // 7. Test 404 for unknown route
    console.log('Testing 404 catch-all route ...');
    const res404 = await fetchUrl('/nonexistent-page-test');
    if (res404.status !== 404) {
      throw new Error(`Expected 404, got ${res404.status}`);
    }
    console.log('✓ 404 catch-all passed');

    // 8. Test multipart file upload
    console.log('Testing POST /upload with valid PDF ...');
    const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
    const pdfContent = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
    
    let body = '';
    body += `--${boundary}\r\n`;
    body += 'Content-Disposition: form-data; name="studentName"\r\n\r\n';
    body += 'Alice Smith\r\n';

    body += `--${boundary}\r\n`;
    body += 'Content-Disposition: form-data; name="rollNumber"\r\n\r\n';
    body += '2026CS202\r\n';

    body += `--${boundary}\r\n`;
    body += 'Content-Disposition: form-data; name="subject"\r\n\r\n';
    body += 'Cloud Computing\r\n';

    body += `--${boundary}\r\n`;
    body += 'Content-Disposition: form-data; name="assignmentTitle"\r\n\r\n';
    body += 'Scalable Cloud Architecture on AWS EC2 & S3\r\n';

    body += `--${boundary}\r\n`;
    body += 'Content-Disposition: form-data; name="assignmentFile"; filename="Alice_Cloud_Report.pdf"\r\n';
    body += 'Content-Type: application/pdf\r\n\r\n';

    const bodyBuffer = Buffer.concat([
      Buffer.from(body, 'utf-8'),
      pdfContent,
      Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8')
    ]);

    const resUploadPost = await fetchUrl('/upload', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length
      },
      body: bodyBuffer
    });

    // Multer upload should redirect to /files?success=...
    if (resUploadPost.status !== 302 || !resUploadPost.headers['location'].includes('/files')) {
      throw new Error(`Upload POST failed: status ${resUploadPost.status}, location: ${resUploadPost.headers['location']}`);
    }
    console.log('✓ POST /upload with valid PDF passed (302 Redirect to /files)');

    // 9. Test POST /upload with executable (MZ header disguised as .pdf)
    console.log('Testing Security rejection of executable disguised as PDF ...');
    const exeContent = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xFF\xFF\x00\x00');
    let badBody = '';
    badBody += `--${boundary}\r\nContent-Disposition: form-data; name="studentName"\r\n\r\nEve Hacker\r\n`;
    badBody += `--${boundary}\r\nContent-Disposition: form-data; name="rollNumber"\r\n\r\n2026CS999\r\n`;
    badBody += `--${boundary}\r\nContent-Disposition: form-data; name="subject"\r\n\r\nCloud Computing\r\n`;
    badBody += `--${boundary}\r\nContent-Disposition: form-data; name="assignmentTitle"\r\n\r\nScalable Cloud Architecture on AWS EC2 & S3\r\n`;
    badBody += `--${boundary}\r\nContent-Disposition: form-data; name="assignmentFile"; filename="fake_report.pdf"\r\n`;
    badBody += 'Content-Type: application/pdf\r\n\r\n';

    const badBuffer = Buffer.concat([
      Buffer.from(badBody, 'utf-8'),
      exeContent,
      Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8')
    ]);

    const resBadUpload = await fetchUrl('/upload', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': badBuffer.length
      },
      body: badBuffer
    });

    if (resBadUpload.status !== 302 || !resBadUpload.headers['location'].includes('error=')) {
      throw new Error(`Executable security check failed: status ${resBadUpload.status}, loc: ${resBadUpload.headers['location']}`);
    }
    console.log('✓ Executable file disguised as PDF was correctly rejected with security error!');

    console.log('\n==========================================');
    console.log(' ALL 9 INTEGRATION SMOKE TESTS PASSED! ');
    console.log('==========================================\n');
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err);
    server.close();
    process.exit(1);
  }
});
