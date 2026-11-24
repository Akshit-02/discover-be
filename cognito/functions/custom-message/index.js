import Logger from "/opt/nodejs/logger.js";
import { renderEmail } from "./template.js";

// Copy per Cognito trigger source. Cognito requires the {####} placeholder in the message.
const MESSAGES = {
  CustomMessage_SignUp: {
    subject: "Verify your email for Kudozz",
    preheader: "Your Kudozz verification code is inside. It expires in 24 hours.",
    heading: "Confirm your email address",
    intro: "Thanks for signing up for Kudozz Influencer Discovery. Enter the code below to verify your email and activate your account.",
    expiry: "This code expires in 24 hours.",
    footnote: "If you didn't create a Kudozz account, you can safely ignore this email. No account will be created without this code.",
  },
  CustomMessage_ResendCode: {
    subject: "Your new Kudozz verification code",
    preheader: "Here's the new verification code you asked for.",
    heading: "Here's your new code",
    intro: "You asked for a new verification code. Enter it below to verify your email and finish setting up your account.",
    expiry: "This code expires in 24 hours. Any earlier codes no longer work.",
    footnote: "If you didn't request this, you can safely ignore this email.",
  },
  CustomMessage_ForgotPassword: {
    subject: "Reset your Kudozz password",
    preheader: "Use this code to reset your Kudozz password. It expires in 1 hour.",
    heading: "Reset your password",
    intro: "We received a request to reset the password for your Kudozz account. Enter the code below to choose a new password.",
    expiry: "This code expires in 1 hour.",
    footnote: "If you didn't ask to reset your password, you can ignore this email. Your password won't change unless someone enters this code.",
  },
  CustomMessage_UpdateUserAttribute: {
    subject: "Confirm your new Kudozz email",
    preheader: "Confirm the new email address on your Kudozz account.",
    heading: "Confirm your new email",
    intro: "You recently changed the email address on your Kudozz account. Enter the code below to confirm it.",
    expiry: "This code expires in 24 hours.",
    footnote: "If you didn't make this change, please reset your password straight away.",
  },
  CustomMessage_VerifyUserAttribute: {
    subject: "Verify your Kudozz email",
    preheader: "Your Kudozz verification code is inside.",
    heading: "Verify your email address",
    intro: "Enter the code below to verify the email address on your Kudozz account.",
    expiry: "This code expires in 24 hours.",
    footnote: "If you didn't request this, you can safely ignore this email.",
  },
};

export const handler = async (event) => {
  const copy = MESSAGES[event.triggerSource];
  // Unknown sources (e.g. admin-created users) keep Cognito's default message.
  if (!copy) return event;

  try {
    const { codeParameter } = event.request;
    const name = event.request.userAttributes?.name?.trim().split(/\s+/)[0];
    event.response.emailSubject = copy.subject;
    event.response.emailMessage = renderEmail({ ...copy, greetingName: name, code: codeParameter });
  } catch (error) {
    // Never block signup / password reset because of a template problem.
    Logger.error("Custom message error:", error);
  }
  return event;
};
