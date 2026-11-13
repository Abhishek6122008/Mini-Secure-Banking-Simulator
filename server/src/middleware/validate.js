// Parses the request body (or query) with a Zod schema. The schemas are strict, so an unexpected field such as
// "balance" or "fromAccountId" is rejected instead of ignored. Messages name the field and the rule, never internals.
function check(schema, value, req, res, next, store) {
  const result = schema.safeParse(value ?? {});
  if (!result.success) {
    const fields = {};
    for (const issue of result.error.issues) {
      const field = issue.path.join('.') || (issue.code === 'unrecognized_keys' ? issue.keys.join(', ') : 'request');
      fields[field] ??= issue.code === 'unrecognized_keys' ? 'Unexpected field' : issue.message;
    }
    return res.status(400).json({ error: 'Invalid request', fields });
  }
  store(result.data);
  next();
}

export const validateBody = (schema) => (req, res, next) =>
  check(schema, req.body, req, res, next, (data) => { req.body = data; });

export const validateQuery = (schema) => (req, res, next) =>
  check(schema, req.query, req, res, next, (data) => { req.validQuery = data; });
