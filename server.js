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

// API: Получить информацию о пользователе
app.get('/user', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1]; // Извлекаем токен из заголовка Authorization

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, 'your-secret-key'); // Декодируем токен, чтобы получить информацию о пользователе
    const userId = decoded.userId; // Получаем userId из токена

    // Запрашиваем данные о пользователе из базы данных
    const result = await pool.query('SELECT imie, nazwisko, email FROM users WHERE user_id = $1', [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      userData: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error fetching user data' });
  }
});

// API: Добавить товар в корзину
app.post('/cart', async (req, res) => {
  const { productId } = req.body;  // Получаем ID товара
  const token = req.headers.authorization?.split(' ')[1]; // Извлекаем токен из заголовка Authorization
  
  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, 'your-secret-key');  // Декодируем токен, чтобы получить информацию о пользователе
    const userId = decoded.userId;  // Получаем userId из токена

    // Добавляем товар в корзину для текущего пользователя
    const result = await pool.query(
      'INSERT INTO cart (user_id, product_id, quantity) VALUES ($1, $2, $3) RETURNING *',
      [userId, productId, 1] // quantity = 1 (по умолчанию)
    );

    res.status(201).json({ success: true, product: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error adding product to cart' });
  }
});

// API: Получить товары из корзины
app.get('/cart/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM cart JOIN cake ON cart.product_id = cake.id WHERE cart.user_id = $1',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching cart items');
  }
});

// API: Удалить товар из корзины
app.delete('/cart/:userId/:productId', async (req, res) => {
  const { userId, productId } = req.params;

  try {
    await pool.query(
      'DELETE FROM cart WHERE user_id = $1 AND product_id = $2',
      [userId, productId]
    );
    res.status(200).send('Product removed from cart');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error removing product from cart');
  }
});

// API: Обновить количество товара в корзине
app.put('/cart/:userId/:productId', async (req, res) => {
  const { userId, productId } = req.params;
  const { quantity } = req.body; // Получаем новое количество

  if (quantity < 1) {
    return res.status(400).json({ success: false, message: 'Количество должно быть больше 0' });
  }

  try {
    // Обновляем количество товара в корзине
    const result = await pool.query(
      'UPDATE cart SET quantity = $1 WHERE user_id = $2 AND product_id = $3 RETURNING *',
      [quantity, userId, productId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Товар не найден в корзине' });
    }

    res.status(200).json({ success: true, updatedItem: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Ошибка при обновлении количества товара' });
  }
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
