const db = require('./backend/db');

app.get('/api/health', async (req, res) => {
  try {
    // Database connectivity test query
    const dbResult = await db.query('SELECT NOW()');
    
    res.status(200).json({
      status: 'UP',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        time: dbResult.rows[0].now,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'DOWN',
      timestamp: new Date().toISOString(),
      database: {
        connected: false,
        error: error.message,
      },
    });
  }
});