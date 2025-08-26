import nodemailer, { Transporter } from 'nodemailer';

// Allow disabling emails during debugging
const DISABLE_EMAILS = process.env.DISABLE_EMAILS === 'true';

// create transporter(s) as `let` so we can swap to a fallback if needed
let transporter: Transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for STARTTLS on 587
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    // better timeout handling so failed connects show quickly
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT) || 10000,
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT) || 10000,
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT) || 10000,
});

// optional fallback transporter (SMTPS port 465) - created on demand
let fallbackTransporter: Transporter | null = null;

// Helper: try to create and verify a fallback SMTPS transporter (port 465, secure)
const tryCreateFallback = async (): Promise<boolean> => {
    try {
        fallbackTransporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
            connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT) || 10000,
            greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT) || 10000,
            socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT) || 10000,
        });

        await fallbackTransporter.verify();
        console.info('Fallback SMTPS transporter verified and ready (port 465)');
        return true;
    } catch (err) {
        console.error('Fallback SMTPS transporter verify failed:', err);
        fallbackTransporter = null;
        return false;
    }
};

// Verify primary transporter at startup so connectivity issues are logged early.
// If it fails with a connection timeout, attempt the SMTPS fallback automatically.
if (!DISABLE_EMAILS) {
    transporter.verify()
        .then(() => console.info('SMTP transporter verified and ready'))
        .catch(async (err: any) => {
            console.error('SMTP transporter verify failed:', err);
            // If we have a timeout/connect error, automatically try SMTPS port 465
            const isConnTimeout = err && (err.code === 'ETIMEDOUT' || err.command === 'CONN' || err.code === 'ECONNECTION');
            if (isConnTimeout) {
                console.info('Connection timed out on primary transporter, attempting SMTPS (port 465) fallback...');
                await tryCreateFallback();
                if (fallbackTransporter) {
                    transporter = fallbackTransporter;
                }
            }
        });
} else {
    console.warn('DISABLE_EMAILS=true — email sending is disabled');
}

interface EmailOptions {
    to: string;
    subject: string;
    html: string;
}

export const sendEmail = async ({ to, subject, html }: EmailOptions): Promise<boolean> => {
    if (DISABLE_EMAILS) {
        console.log(`Email disabled (DISABLE_EMAILS=true). Skipping send to ${to} subject=${subject}`);
        return false;
    }
    const doSend = async (tx: Transporter) => {
        return tx.sendMail({
            from: `"Bio Attendance System" <${process.env.SMTP_USER}>`,
            to,
            subject,
            html,
        });
    };

    try {
        const info = await doSend(transporter);
        console.log('Message sent: %s', info.messageId);
        return true;
    } catch (error: any) {
        console.error('Error sending email with primary transporter:', error);

        // If it's a connection timeout or connection error, try fallback transporter one time
        const isConnTimeout = error && (error.code === 'ETIMEDOUT' || error.command === 'CONN' || error.code === 'ECONNECTION' || error.code === 'ESOCKET');
        if (isConnTimeout) {
            console.info('Detected connection timeout/issue. Attempting one-time SMTPS fallback (port 465)...');

            // If fallback was already created and verified earlier, use it; otherwise create now
            if (!fallbackTransporter) {
                const ok = await tryCreateFallback();
                if (!ok) return false;
            }

            if (fallbackTransporter) {
                try {
                    const info2 = await doSend(fallbackTransporter);
                    console.log('Message sent via fallback SMTPS: %s', info2.messageId);
                    // swap transporter to fallback for subsequent sends
                    transporter = fallbackTransporter;
                    return true;
                } catch (err2) {
                    console.error('Error sending email with fallback transporter:', err2);
                    return false;
                }
            }
        }

        return false;
    }
};

export const sendWelcomeEmail = async (studentEmail: string, studentName: string) => {
    const subject = 'Welcome to Bio Attendance System';
    const html = `
        <h2>Welcome ${studentName}!</h2>
        <p>Your account has been successfully created in the Bio Attendance System.</p>
        <p>Your attendance will now be tracked using your biometric data.</p>
        <p>If you have any questions or concerns, please contact your course instructor.</p>
        <br>
        <p>Best regards,</p>
        <p>Bio Attendance System Team</p>
    `;

    return sendEmail({ to: studentEmail, subject, html });
};

export const sendAttendanceConfirmationEmail = async (
    studentEmail: string, 
    studentName: string,
    courseName: string,
    courseCode: string,
    date: string
) => {
    const subject = `Attendance Recorded for ${courseCode}`;
    const html = `
        <h2>Hello ${studentName},</h2>
        <p>Your attendance has been successfully recorded for:</p>
        <ul>
            <li>Course: ${courseName} (${courseCode})</li>
            <li>Date: ${date}</li>
        </ul>
        <p>If you believe this was recorded in error, please contact your course instructor immediately.</p>
        <br>
        <p>Best regards,</p>
        <p>Bio Attendance System Team</p>
    `;

    return sendEmail({ to: studentEmail, subject, html });
};

export const sendMissedAttendanceEmail = async (
    studentEmail: string,
    studentName: string,
    courseName: string,
    courseCode: string,
    date: string
) => {
    const subject = `Missed Attendance for ${courseCode}`;
    const html = `
        <h2>Hello ${studentName},</h2>
        <p>Our records show that you were not marked present for the following class:</p>
        <ul>
            <li>Course: ${courseName} (${courseCode})</li>
            <li>Date: ${date}</li>
        </ul>
        <p>If you believe this is a mistake, please contact your course instructor as soon as possible.</p>
        <br>
        <p>Best regards,</p>
        <p>Bio Attendance System Team</p>
    `;

    return sendEmail({ to: studentEmail, subject, html });
};
