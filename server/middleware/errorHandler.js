import { AppError } from '../utils/AppError.js';

// Unknown route -> 404 JSON instead of Express's default HTML page.
export function notFound(req, res) {
  res.status(404).json({ message: 'Not found.' });
}

// Express recognises error handlers by their 4 arguments (err, req, res, next).
// Every thrown error - in any route or middleware - ends up here.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // Errors we threw on purpose: safe to show their message.
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ message: err.message, ...err.extra });
  }

  // Malformed JSON body or body too big (from express.json()).
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid request body.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Request body too large.' });
  }

  // Anything else is a bug or an outage. Log the details for us (server logs),
  // but send the user a generic message - never the stack trace or internal error text.
  console.error('Unexpected error:', err);
  res.status(500).json({ message: 'Something went wrong. Please try again later.' });
}
