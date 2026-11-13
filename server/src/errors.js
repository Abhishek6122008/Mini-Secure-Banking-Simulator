// An error whose message is safe to show the user.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// The last handler. Users get a generic message; the log gets the error's name and code only. Request bodies,
// headers, tokens and database error text (which can quote row values) are never logged.
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
  console.error(`[${req.method} ${req.path}] ${err.name}${err.code ? ` (${err.code})` : ''}`);
  res.status(500).json({ error: 'Something went wrong' });
}
