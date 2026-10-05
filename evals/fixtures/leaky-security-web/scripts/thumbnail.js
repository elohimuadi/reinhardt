const { exec } = require('child_process')

module.exports = function thumbnail(file, transform) {
  exec(`convert ${file} -resize 200x200 thumb.png`)
  return eval(transform)
}
