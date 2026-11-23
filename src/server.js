const path = require('path');
const fs = require('fs');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const swaggerUi = require('swagger-ui-express');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-me';
const PORT = process.env.PORT || 3000;

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['organizador', 'participante'], required: true }
}, { timestamps: true });
const leagueSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  organizer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status: { type: String, enum: ['aguardando_participantes', 'grupos_sorteados'], default: 'aguardando_participantes' },
  groups: [[{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]]
}, { timestamps: true });
const User = mongoose.model('User', userSchema);
const League = mongoose.model('League', leagueSchema);

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  try {
    if (!token) throw new Error('Token ausente');
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({ erro: 'Autenticação necessária.' }); }
}
function organizerOnly(req, res, next) {
  if (req.user.role !== 'organizador') return res.status(403).json({ erro: 'Apenas organizadores podem realizar esta ação.' });
  next();
}
function publicUser(user) { return { id: user._id, name: user.name, email: user.email, role: user.role }; }

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(null, {
  swaggerOptions: { url: '/api-docs.yaml' },
  customSiteTitle: 'Areia API — Swagger'
}));
app.get('/api-docs.yaml', (_req, res) => {
  res.type('application/yaml').send(fs.readFileSync(path.join(__dirname, '..', 'openapi.yaml'), 'utf8'));
});
app.get('/ligas', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'leagues.html')));

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password || !['organizador', 'participante'].includes(role))
      return res.status(400).json({ erro: 'Informe nome, email, senha e um perfil válido.' });
    if (password.length < 8) return res.status(400).json({ erro: 'A senha deve ter pelo menos 8 caracteres.' });
    const user = await User.create({ name, email, password: await bcrypt.hash(password, 10), role });
    res.status(201).json({ usuario: publicUser(user) });
  } catch (err) { next(err); }
});
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const user = await User.findOne({ email: req.body?.email?.toLowerCase() });
    if (!user || !(await bcrypt.compare(req.body?.password || '', user.password)))
      return res.status(401).json({ erro: 'Email ou senha inválidos.' });
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, usuario: publicUser(user) });
  } catch (err) { next(err); }
});

app.get('/api/leagues', async (_req, res, next) => {
  try {
    const leagues = await League.find().populate('organizer', 'name').populate('participants', 'name email').populate('groups', 'name email').sort({ createdAt: -1 });
    res.json(leagues);
  } catch (err) { next(err); }
});
app.post('/api/leagues', auth, organizerOnly, async (req, res, next) => {
  try {
    if (!req.body?.name?.trim()) return res.status(400).json({ erro: 'O nome da liga é obrigatório.' });
    const league = await League.create({ name: req.body.name.trim(), organizer: req.user.id });
    res.status(201).json(league);
  } catch (err) { next(err); }
});
app.post('/api/leagues/:id/join', auth, async (req, res, next) => {
  try {
    if (req.user.role !== 'participante') return res.status(403).json({ erro: 'Somente participantes podem entrar em uma liga.' });
    const league = await League.findById(req.params.id);
    if (!league) return res.status(404).json({ erro: 'Liga não encontrada.' });
    if (league.status !== 'aguardando_participantes') return res.status(409).json({ erro: 'As inscrições desta liga foram encerradas.' });
    if (league.participants.some(id => id.toString() === req.user.id)) return res.status(409).json({ erro: 'Você já está inscrito nesta liga.' });
    league.participants.push(req.user.id);
    await league.save();
    await league.populate('organizer', 'name');
    await league.populate('participants', 'name email');
    res.status(200).json(league);
  } catch (err) { next(err); }
});
app.post('/api/leagues/:id/draw', auth, organizerOnly, async (req, res, next) => {
  try {
    const league = await League.findById(req.params.id);
    if (!league) return res.status(404).json({ erro: 'Liga não encontrada.' });
    if (league.organizer.toString() !== req.user.id) return res.status(403).json({ erro: 'Somente o organizador desta liga pode sortear os grupos.' });
    if (league.status !== 'aguardando_participantes') return res.status(409).json({ erro: 'Os grupos já foram sorteados.' });
    const ids = league.participants.map(id => id.toString());
    if (ids.length < 4) return res.status(400).json({ erro: 'A liga precisa de pelo menos 4 participantes para sortear os grupos.' });
    // Produz grupos de quatro sempre que possível e distribui o restante em grupos existentes.
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const count = Math.ceil(ids.length / 4);
    const groups = Array.from({ length: count }, () => []);
    ids.forEach((id, index) => groups[index % count].push(id));
    league.groups = groups;
    league.status = 'grupos_sorteados';
    await league.save();
    await league.populate('organizer', 'name');
    await league.populate('participants', 'name email');
    await league.populate('groups', 'name email');
    res.json(league);
  } catch (err) { next(err); }
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
app.use((err, _req, res, _next) => {
  if (err.code === 11000) return res.status(409).json({ erro: 'Este email já está cadastrado.' });
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

async function seed() {
  const seedUsers = [
    ['Ana Organiza', 'ana.organizadora@beachliga.com', 'Beach2026!', 'organizador'],
    ['Bruno Organiza', 'bruno.organizador@beachliga.com', 'Beach2026!', 'organizador'],
    ['Carla Costa', 'carla.participante@beachliga.com', 'Beach2026!', 'participante'],
    ['Diego Silva', 'diego.participante@beachliga.com', 'Beach2026!', 'participante'],
    ['Fernanda Prado', 'fernanda.organizadora@beachliga.com', 'Beach2026!', 'organizador'],
    ['Elisa Martins', 'elisa.participante@beachliga.com', 'Beach2026!', 'participante'],
    ['Felipe Rocha', 'felipe.participante@beachliga.com', 'Beach2026!', 'participante'],
    ['Gabriela Lima', 'gabriela.participante@beachliga.com', 'Beach2026!', 'participante'],
    ['Henrique Alves', 'henrique.participante@beachliga.com', 'Beach2026!', 'participante'],
    ['Isabela Nunes', 'isabela.participante@beachliga.com', 'Beach2026!', 'participante'],
    ['João Pedro', 'joao.participante@beachliga.com', 'Beach2026!', 'participante'],
    ['Larissa Melo', 'larissa.participante@beachliga.com', 'Beach2026!', 'participante'],
    ['Marcos Vieira', 'marcos.participante@beachliga.com', 'Beach2026!', 'participante'],
    ['Nina Carvalho', 'nina.participante@beachliga.com', 'Beach2026!', 'participante'],
    ['Otávio Santos', 'otavio.participante@beachliga.com', 'Beach2026!', 'participante']
  ];
  await Promise.all(seedUsers.map(async ([name, email, password, role]) => {
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.updateOne(
      { email },
      { $setOnInsert: { name, email, password: hashedPassword, role } },
      { upsert: true }
    );
  }));

  const sampleUsers = await User.find({ email: { $in: seedUsers.map(([, email]) => email) } });
  const usersByEmail = new Map(sampleUsers.map(user => [user.email, user]));
  const organizer = usersByEmail.get('ana.organizadora@beachliga.com');
  const openingParticipants = [
    'carla.participante@beachliga.com',
    'diego.participante@beachliga.com',
    'elisa.participante@beachliga.com',
    'felipe.participante@beachliga.com',
    'gabriela.participante@beachliga.com',
    'henrique.participante@beachliga.com',
    'isabela.participante@beachliga.com',
    'joao.participante@beachliga.com'
  ].map(email => usersByEmail.get(email)._id);
  const sampleLeagues = [
    { name: 'Copa Areia de Verão', participants: openingParticipants },
    { name: 'Desafio das Dunas', participants: [] },
    { name: 'Liga Pôr do Sol', participants: [] }
  ];
  await Promise.all(sampleLeagues.map(({ name, participants }) => League.updateOne(
    { name },
    { $setOnInsert: { name, organizer: organizer._id, participants, status: 'aguardando_participantes' } },
    { upsert: true }
  )));
}

async function start() {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await seed();
  app.listen(PORT, () => console.log(`Beach Liga disponível em http://localhost:${PORT}`));
}
start().catch(err => { console.error('Não foi possível iniciar o servidor:', err); process.exit(1); });
