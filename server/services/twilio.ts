// Twilio SMS Service
import twilio from 'twilio';

function getCredentials() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !phoneNumber) {
    throw new Error(
      'Missing Twilio credentials. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in Replit Secrets.'
    );
  }

  return { accountSid, authToken, phoneNumber };
}

export function getTwilioClient() {
  const { accountSid, authToken } = getCredentials();
  return twilio(accountSid, authToken);
}

export function getTwilioFromPhoneNumber() {
  const { phoneNumber } = getCredentials();
  return phoneNumber;
}

export async function sendSMS(to: string, message: string): Promise<boolean> {
  try {
    const client = getTwilioClient();
    const fromNumber = getTwilioFromPhoneNumber();
    
    await client.messages.create({
      body: message,
      from: fromNumber,
      to: to
    });
    
    console.log(`SMS sent successfully to ${to}`);
    return true;
  } catch (error: any) {
    console.error('Failed to send SMS:', error.message);
    return false;
  }
}

export async function sendVerificationSMS(to: string): Promise<string | null> {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const message = `Your TSP verification code is: ${code}. This code expires in 10 minutes.`;
  
  const success = await sendSMS(to, message);
  return success ? code : null;
}
