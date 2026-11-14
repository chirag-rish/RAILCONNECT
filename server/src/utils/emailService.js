const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
    // In test environments, skip sending real emails for speed and stability.
    if (process.env.NODE_ENV === 'test') {
        console.log('Skipping email send in test environment:', options);
        return { previewUrl: null, loggedToFile: false };
    }

    let transporter;
    const fs = require('fs');

    const isPlaceholder = (val) => !val || val.includes('your-email') || val.includes('your-app-password');

    let previewUrl = null;
    if (process.env.SMTP_HOST && !isPlaceholder(process.env.SMTP_USER) && !isPlaceholder(process.env.SMTP_PASS)) {
        // Real SMTP configuration (e.g., Gmail)
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT || 587,
            secure: process.env.SMTP_PORT == 465,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
        console.log('Using Real SMTP Service...');
    } else {
        // Fallback to Ethereal (Fake SMTP for testing)
        console.log('SMTP credentials missing or placeholders detected. Falling back to Ethereal/Local Log...');
        try {
            const testAccount = await nodemailer.createTestAccount();
            transporter = nodemailer.createTransport({
                host: 'smtp.ethereal.email',
                port: 587,
                secure: false,
                auth: {
                    user: testAccount.user,
                    pass: testAccount.pass,
                },
            });
        } catch (etherealError) {
            console.error('Failed to create Ethereal account. Will log link to file only.', etherealError);
        }
    }

    // Capture reset link if provided in message
    const linkMatch = options.message.match(/https?:\/\/[^"]+\/reset-password\/[A-Za-z0-9_-]+/);
    if (linkMatch) {
        const link = linkMatch[0];
        const logEntry = `\n[${new Date().toISOString()}] Reset Link for ${options.email}: ${link}\n`;
        fs.appendFileSync('password_reset_links.txt', logEntry);
        console.log('!!! RESET LINK LOGGED TO password_reset_links.txt !!!');
    }

    if (!transporter) {
        if (linkMatch) return { previewUrl, loggedToFile: true };
        throw new Error('No mail transporter available and no reset link found to log.');
    }

    const message = {
        from: `"${process.env.FROM_NAME || 'RailConnect Support'}" <${process.env.FROM_EMAIL || 'noreply@railconnect.com'}>`,
        to: options.email,
        subject: options.subject,
        text: options.message,
        html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; background-color: #f8fafc; color: #1e293b;">
                <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                    <div style="background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); padding: 30px; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 24px;">RailConnect</h1>
                    </div>
                    <div style="padding: 40px; line-height: 1.6;">
                        <h2 style="color: #1e293b; margin-top: 0;">${options.subject}</h2>
                        <p style="font-size: 16px;">Hello,</p>
                        <p style="font-size: 16px;">${options.message}</p>
                        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #64748b;">
                            <p>Best Regards,</p>
                            <p><strong>RailConnect Team</strong></p>
                        </div>
                    </div>
                </div>
            </div>
        `,
    };

    try {
        const info = await transporter.sendMail(message);
        console.log('Message sent: %s', info.messageId);
        if (!process.env.SMTP_HOST || isPlaceholder(process.env.SMTP_USER)) {
            previewUrl = nodemailer.getTestMessageUrl(info);
            console.log('Preview URL: %s', previewUrl);
        }
    } catch (mailError) {
        console.error('Mail delivery failed.', mailError);
        if (linkMatch) {
            console.log('Link was logged to file, so proceeding as success for development.');
            return { previewUrl, loggedToFile: true };
        }
        throw mailError;
    }

    return { previewUrl, loggedToFile: !!linkMatch };
};

module.exports = sendEmail;
