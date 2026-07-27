export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface InvitationEmailMessage {
  to: string;
  subject: string;
  url: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
  sendInvitation(message: InvitationEmailMessage): Promise<void>;
}
