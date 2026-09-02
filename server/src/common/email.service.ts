import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async sendInvitation(email: string, url: string) {
    this.logDevelopmentLink("Invitation", email, url);
  }

  async sendEmailVerification(email: string, url: string) {
    this.logDevelopmentLink("Email verification", email, url);
  }

  async sendPasswordReset(email: string, url: string) {
    this.logDevelopmentLink("Password reset", email, url);
  }

  private logDevelopmentLink(kind: string, email: string, url: string) {
    if (process.env.NODE_ENV === "production") {
      this.logger.warn(`${kind} email requested for ${email}, but no production email provider is configured.`);
      return;
    }
    this.logger.log(`${kind} link for ${email}: ${url}`);
  }
}
