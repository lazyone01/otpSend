// An error we throw on purpose, with a message that is SAFE to show the user.
// Anything that is not an AppError is treated as an unexpected bug and hidden.
export class AppError extends Error {
  constructor(statusCode, message, extra = {}) {
    super(message);
    this.statusCode = statusCode;
    this.extra = extra; // optional additional fields for the JSON response
  }
}
