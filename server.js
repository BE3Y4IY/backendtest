const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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
  const { name, opis, price } = req.body; // Теперь получаем 'opis'
  const image_url = req.file ? `/uploads/${req.file.filename}` : null; // Указываем URL изображения

  try {
    const result = await pool.query(
      'INSERT INTO cake (name, opis, price, image_url) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, opis, price, image_url]  // Передаем 'opis' в запрос
    );
    res.status(201).json(result.rows[0]); // Отправляем добавленный продукт
  } catch (err) {
    console.error(err);
    res.status(500).send('Error adding product');
  }
});

// Регистрация пользователя
app.post('/register', async (req, res) => {
  const { name, surname, email, password } = req.body;

  try {
    // Хэшируем пароль
    const hashedPassword = await bcrypt.hash(password, 10);

    // Проверяем, существует ли уже пользователь с таким email
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    // Добавляем нового пользователя
    const newUser = await pool.query(
      'INSERT INTO users (imie, nazwisko, email, password) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, surname, email, hashedPassword]
    );
    
    res.json({ success: true, user: newUser.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error registering user' });
  }
});

// Логин пользователя
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Проверяем, существует ли пользователь с таким email
    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'User not found' });
    }

    // Сравниваем пароли
    const isValidPassword = await bcrypt.compare(password, user.rows[0].password);
    if (!isValidPassword) {
      return res.status(400).json({ success: false, message: 'Invalid password' });
    }

    // Генерация JWT токена, теперь добавляем поле imie в токен
    const token = jwt.sign(
      {
        userId: user.rows[0].user_id,   // Идентификатор пользователя
        userName: user.rows[0].imie     // Имя пользователя, которое мы хотим хранить в токене
      },
      'your-secret-key',
      { expiresIn: '1h' }
    );

    res.json({ success: true, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error logging in user' });
  }
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
