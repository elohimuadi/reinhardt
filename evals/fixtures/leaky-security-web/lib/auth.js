const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const crypto = require('crypto')

exports.check = token => jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256', 'none'] })
exports.hashPassword = pw => bcrypt.hash(pw, 8)
exports.etag = body => crypto.createHash('md5').update(body).digest('hex')
exports.cookie = { httpOnly: false, sameSite: 'lax' }
exports.login = (email, password) => { console.log('login attempt', email, password) }
