// module b
let c = require('./c.js');

module.exports = function () {
    console.log('b');
    console.log('b中的c');
    c();
    console.log('b中的c');
};