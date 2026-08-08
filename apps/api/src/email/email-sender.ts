export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface InvitationEmailMessage {
  to: string;
  householdName: string;
  inviterName?: string;
  url: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
  sendInvitation(message: InvitationEmailMessage): Promise<void>;
}
