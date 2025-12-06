const express = require('express');
const app = express();
app.use(express.json());

app.post('/render', async (req, res) => {
  res.json({ status: 'FFmpeg server running' });
});

app.listen(3000, () => console.log('Server on port 3000'));
