const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 5000;

// Подключение к базе данных
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'shop',
  password: 'yourpassword', // Замените на свой пароль
  port: 5432,
});

// Создание хранилища для загрузки изображений
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads'; // Папка для хранения изображений
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir); // Создаем папку, если её нет
    }
    cb(null, dir); // Указываем папку назначения
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Уникальное имя файла
  },
});

const upload = multer({ storage });

// Middleware
app.use(express.json());
app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Обслуживаем файлы из папки uploads

// Обработчик для корня
app.get('/', (req, res) => {
  res.send('Server is working!');
});

// API: Получить все товары
app.get('/cake', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cake');
    res.json(result.rows); // Возвращаем все товары
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching products');
  }
});

// API: Добавить товар (с изображением)
app.post('/cake', upload.single('image'), async (req, res) => {
  const { name, price } = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : null; // Указываем URL изображения

  try {
    const result = await pool.query(
      'INSERT INTO cake (name, price, image_url) VALUES ($1, $2, $3) RETURNING *',
      [name, price, image_url]
    );
    res.status(201).json(result.rows[0]); // Отправляем добавленный продукт
  } catch (err) {
    console.error(err);
    res.status(500).send('Error adding product');
  }
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
