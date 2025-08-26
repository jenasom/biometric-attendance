import { Router } from 'express';
import { sendEmail } from '../services/email.service';

const router = Router();

router.post('/test-email', async (req, res) => {
    try {
        const result = await sendEmail({
            to: req.body.email,
            subject: 'Bio Attendance System - Test Email',
            html: `
                <h2>Email Configuration Test</h2>
                <p>If you're receiving this email, your email configuration is working correctly!</p>
                <p>Time sent: ${new Date().toLocaleString()}</p>
                <br>
                <p>Best regards,</p>
                <p>Bio Attendance System Team</p>
            `
        });

        if (result) {
            res.json({ success: true, message: 'Test email sent successfully' });
        } else {
            res.status(500).json({ success: false, message: 'Failed to send test email' });
        }
    } catch (error) {
        console.error('Email test error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to send test email', 
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        });
    }
});

export default router;
