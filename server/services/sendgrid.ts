// SendGrid Email Service - Using Replit SendGrid Integration
import sgMail from '@sendgrid/mail';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=sendgrid',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key || !connectionSettings.settings.from_email)) {
    throw new Error('SendGrid not connected');
  }
  return { apiKey: connectionSettings.settings.api_key, email: connectionSettings.settings.from_email };
}

export async function getUncachableSendGridClient() {
  const { apiKey, email } = await getCredentials();
  sgMail.setApiKey(apiKey);
  return {
    client: sgMail,
    fromEmail: email
  };
}

export async function sendEmail(to: string, subject: string, htmlContent: string, textContent?: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getUncachableSendGridClient();
    
    await client.send({
      to,
      from: fromEmail,
      subject,
      text: textContent || htmlContent.replace(/<[^>]*>/g, ''),
      html: htmlContent,
    });
    
    console.log(`Email sent successfully to ${to}`);
    return true;
  } catch (error: any) {
    console.error('Failed to send email:', error.message);
    return false;
  }
}

export async function sendNotificationEmail(to: string, title: string, message: string): Promise<boolean> {
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #236383; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">TSP Intake</h1>
      </div>
      <div style="padding: 30px; background-color: #f9f9f9;">
        <h2 style="color: #236383; margin-top: 0;">${title}</h2>
        <p style="color: #333; line-height: 1.6;">${message}</p>
      </div>
      <div style="background-color: #236383; padding: 15px; text-align: center;">
        <p style="color: white; margin: 0; font-size: 12px;">&copy; ${new Date().getFullYear()} The Sandwich Project</p>
      </div>
    </div>
  `;
  
  return sendEmail(to, `[TSP] ${title}`, htmlContent);
}
