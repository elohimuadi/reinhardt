const express = require('express')
const cors = require('cors')
const multer = require('multer')
const { Pool } = require('pg')

const app = express()
const pool = new Pool({ ssl: { rejectUnauthorized: false } })
const upload = multer({ dest: 'uploads/' })
app.use(cors({ origin: true, credentials: true }))

app.get('/notes/:id', async (req, res) => {
  const { rows } = await pool.query(`SELECT * FROM notes WHERE id = ${req.params.id}`)
  res.json(rows[0])
})

app.post('/users', async (req, res) => {
  res.json(await User.create(req.body))
})

app.get('/preview', async (req, res) => {
  const page = await fetch(req.query.url)
  res.send(await page.text())
})

app.get('/login/done', (req, res) => res.redirect(req.query.next))

app.post('/invite', (req, res) => {
  const inviteCode = Math.random().toString(36).slice(2)
  res.json({ inviteCode })
})

app.post('/avatar', upload.single('file'), (req, res) => res.sendStatus(204))
app.listen(3000)
