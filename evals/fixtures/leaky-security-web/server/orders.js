const nunjucks = require('nunjucks')

nunjucks.configure('views', { autoescape: false })

module.exports.track = (db, id) =>
  db.collection('orders').find({ $where: `this.orderId === '${id}'` }).toArray()
