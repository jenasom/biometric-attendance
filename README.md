# Biometric Attendance System

This biometric attendance system is a time and attendance tracking system that allows staff or teachers to organize courses, manage students and mark students' attendance using their most unique physical characteristics—their fingerprints. It's built with computer vision (Python OpenCV), Flask and the MERN stack.

**NB**: This system has been built and tested with The DigitalPersona U.are.U 4500 scanner only. It only supports Windows OS for now.

Below is an image of a DigitalPersona U.are.U 4500 scanner
![DigitalPersona U.are.U 4500 scanner](./screenshots/digitalpersona_scanner_full.jpg)

Download and install the client for windows here: [HID DigitalPersona Client](https://drive.google.com/file/d/12QCh311WQ-_PIkMHeXqNRfTkbIWnnSdY/view?usp=sharing)

## Project Structure

The project is divided into three sections:

1. `client` (frontend)
2. `server` (core backend)
3. `server-py` (matching backend)

## Getting Started

Follow the steps below to set up the project locally

1.  Clone repo:

  ```bash
  [HTTPS] - git clone git@github.com:IamGideonIdoko/bio-attendance-sys.git
  [SSH] - git clone https://github.com/IamGideonIdoko/bio-attendance-sys.git
  ```

2. Install `client` dependencies:

  ```bash
  make client-deps
  ```

3. Install `server` dependencies:

  ```bash
  make server-deps
  ```

4. Install `server-py` dependencies

    i. Create a conda environment

     ```bash
     make conda-env
     ```

    ii. Activate created conda environment

     ```bash
     conda activate bas_env
     ```

    iii. Install dependencies

     ```bash
     make match-server-deps
     ```

5. Create a MySQL database (eg. `bioattendancesysdb`)

6. Set up `.env` in `server` and update with neccessary details

  ```bash
  make core-server-env
  ```

7. Run DB migration

  ```bash
  make dev-migrate
  ```

8. Run DB migration

  ```bash
  make dev-migrate
  ```

9. In a new terminal, start `server`

  ```bash
  make core-server
  ```

10. In a conda activated `bas_env` environment terminal, start `server-py`

  ```bash
  make match-server
  ```

11. In a new terminal, start `client`

  ```bash
  make client-server
  ```

## Project DB ERD
![Entity Relationship Diagram](./server/prisma/diagrams/ERD-auto.svg)

## Screenshots
![Screenshot of system 1](./screenshots/bas_screenshot_1.JPG)

![Screenshot of system 2](./screenshots/bas_screenshot_2.JPG)

![Screenshot of system 3](./screenshots/bas_screenshot_3.JPG)

![Screenshot of system 4](./screenshots/bas_screenshot_4.JPG)

![Screenshot of system 5](./screenshots/bas_screenshot_5.jpg)

![Screenshot of system 6](./screenshots/bas_screenshot_6.JPG)

![Screenshot of system 7](./screenshots/bas_screenshot_7.JPG)

## System Documentation

### Key Features

- Biometric student registration with fingerprint capture
- Real-time fingerprint verification for attendance marking
- Course management and student enrollment
- Automated email notifications for:
  - Student registration confirmation
  - Attendance confirmation
  - Missed attendance alerts
- Attendance reports and tracking

### Requirements

#### Hardware Requirements
- DigitalPersona U.are.U 4500 Fingerprint Scanner or compatible device
- Computer with USB port for scanner connection
- Windows OS (currently supported platform)

#### Software Requirements

- **For Client (Frontend)**
  - Node.js 16.x or higher
  - npm or yarn package manager
  - Modern web browser with JavaScript enabled
  - HID DigitalPersona Client (Windows)

- **For Server (Backend)**
  - Node.js 16.x or higher
  - MySQL 8.0 or higher
  - TypeScript 4.x or higher

- **For Python Verification Service**
  - Python 3.8 or higher
  - OpenCV
  - Flask
  - numpy
  - scikit-image
  - Conda or Python virtual environment

- **For Email Service**
  - Gmail account with App Password enabled
  - SMTP access (ports 465 or 587 must be accessible)

### Configuration Guide

#### Server Environment Variables (.env)

```properties
APP_NAME=Bio Attendance Sys
APP_PORT=5005
DB_CONNECTION_URL=mysql://user:password@localhost:3306/bioattendancesysdb
ACCESS_TOKEN_SECRET=your_access_token_secret
REFRESH_TOKEN_SECRET=your_refresh_token_secret

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
DISABLE_EMAILS=false
```

#### Email Setup Guide

1. Enable 2-Step Verification in your Google Account
2. Generate an App Password:
   - Go to Google Account Security settings
   - Navigate to 2-Step Verification → App passwords
   - Select "Other" as app and name it "Bio Attendance System"
   - Copy the generated 16-character password
   - Update SMTP_PASS in .env with this password

### System Architecture

#### Components

1. **Client (React + TypeScript)**
   - User interface for student registration
   - Fingerprint capture integration
   - Attendance marking interface
   - Course management

2. **Server (Node.js + TypeScript)**
   - RESTful API endpoints
   - Business logic
   - Database operations
   - Email notifications
   - Authentication & authorization

3. **Python Verification Service**
   - Fingerprint template storage
   - Fingerprint matching & verification
   - OpenCV-based image processing

4. **Database (MySQL + Prisma)**
   - Student records
   - Course information
   - Attendance records
   - Fingerprint data

### Observations & Challenges

#### Observations

1. **Fingerprint Verification**
   - System successfully captures and verifies fingerprints
   - Verification accuracy depends on scan quality
   - Multiple scans might be needed for optimal registration

2. **Email Notifications**
   - SMTP connection requires proper network configuration
   - Gmail's security features require App Password setup
   - Email delivery can be affected by network conditions

3. **Performance**
   - Fingerprint verification is quick for individual checks
   - Batch operations (like end-of-session attendance) handle multiple records efficiently
   - Client-side fingerprint capture is reliable with proper SDK integration

#### Challenges

1. **Technical Challenges**
   - SMTP connectivity issues with certain network configurations
   - Fingerprint SDK browser compatibility requirements
   - Managing consistent fingerprint scan quality
   - Foreign key constraints in attendance deletion

2. **Implementation Challenges**
   - Coordinating between three different services (Node.js, Python, React)
   - Handling asynchronous fingerprint verification
   - Managing state between fingerprint capture and verification
   - Email service reliability

### Recommendations

1. **System Improvements**
   - Implement a backup verification method (PIN/password) for scanner issues
   - Add batch processing capabilities for multiple attendance records
   - Implement offline mode with sync capabilities
   - Add automated backups for fingerprint templates

2. **Security Enhancements**
   - Implement rate limiting for verification attempts
   - Add audit logging for all biometric operations
   - Enhance encryption for fingerprint data storage
   - Implement session timeout and automatic logout

3. **Performance Optimization**
   - Cache frequently accessed student data
   - Optimize fingerprint template storage
   - Implement batch email processing
   - Add request queuing for high-load scenarios

4. **Usability Improvements**
   - Add bulk student import/export functionality
   - Implement attendance reports and analytics
   - Add customizable email templates
   - Implement multi-language support

5. **Maintenance Recommendations**
   - Regular database backups
   - Periodic cleanup of temporary fingerprint files
   - Monitor email delivery success rates
   - Regular scanner calibration and cleaning

## Troubleshooting

### Common Issues and Solutions

1. **Fingerprint Scanner Issues**
   - Ensure HID DigitalPersona Client is installed and running
   - Check USB connection
   - Clean scanner surface
   - Restart the client application

2. **Email Sending Issues**
   - Verify SMTP credentials
   - Check network connectivity to SMTP server
   - Ensure correct ports (465/587) are accessible
   - Check SMTP_SECURE setting matches port

3. **Database Connection Issues**
   - Verify MySQL service is running
   - Check database credentials
   - Ensure database exists
   - Verify connection string format

## Contributing

