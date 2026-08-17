const crypto = require('crypto')

function shopRequestDocumentId(groupId, requestId) {
  if (!groupId || !requestId) return ''
  return crypto.createHash('sha256').update(`${groupId}:${requestId}`).digest('hex')
}

module.exports = { shopRequestDocumentId }
