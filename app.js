import express from 'express';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import mysql from 'mysql2/promise';
import bodyParser from 'body-parser';
import cors from 'cors';

const app = express();
app.use(bodyParser.json());
app.use(cors());

//DB Config
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'your_username',
  password: process.env.DB_PASSWORD || 'your_password',
  database: process.env.DB_NAME || 'existing_land_records_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};
const pool = mysql.createPool(dbConfig);

async function generatePDF(records, res) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const timestamp = Date.now();
    const pdfPath = `./temp/land_record_${timestamp}.pdf`;
    
    if (!fs.existsSync('./temp')) {
      fs.mkdirSync('./temp');
    }
    
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    // PDF Header
    doc.fontSize(18).text('Land Record Certificate', { align: 'center' });
    doc.moveDown();
    
    // Doc details
    doc.fontSize(10)
       .text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' });
    doc.moveDown();
    
    // Records table
    let y = doc.y;
    doc.font('Helvetica-Bold');
    doc.text('Parcel ID', 50, y);
    doc.text('Owner', 150, y);
    doc.text('Location', 300, y);
    doc.text('Area (sq ft)', 450, y);
    doc.moveDown();
    
    doc.font('Helvetica');
    records.forEach(record => {
      y = doc.y;
      doc.text(record.parcel_id, 50, y);
      doc.text(record.owner_name, 150, y);
      doc.text(record.location, 300, y);
      doc.text(record.area.toString(), 450, y);
      doc.moveDown();
    });

    doc.end();

    writeStream.on('finish', () => {
      res.download(pdfPath, `land_record_${timestamp}.pdf`, (err) => {
        fs.unlink(pdfPath, () => {}); // Clean up
        if (err) reject(err);
        else resolve();
      });
    });
    
    writeStream.on('error', reject);
  });
}

//Endpoint
app.post('/api/search', async (req, res) => {
  const { searchQuery } = req.body;
  
  if (!searchQuery?.trim()) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    
    const [results] = await connection.query(
      `SELECT parcel_id, plot_number, owner_name, area, location, registration_date 
       FROM land_records 
       WHERE parcel_id LIKE ? 
       OR plot_number LIKE ? 
       OR owner_name LIKE ?
       ORDER BY registration_date DESC
       LIMIT 50`,
      [`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`]
    );
    
    if (!results.length) {
      return res.status(404).json({ message: 'No records found' });
    }

    await generatePDF(results, res);
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ 
      error: 'Database operation failed',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  } finally {
    if (connection) connection.release();
  }
});


app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Connected to database: ${dbConfig.database}`);
});