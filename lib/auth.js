import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import prisma from './prisma';

const JWT_SECRET = process.env.JWT_SECRET || 'xinchao-news-secret-key-change-in-production';
const TOKEN_NAME = 'xinchao_auth_token';
const TOKEN_EXPIRY = '7d';

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, hashedPassword) {
  return bcrypt.compare(password, hashedPassword);
}

export function generateToken(user) {
  return jwt.sign(
    { 
      userId: user.id, 
      email: user.email, 
      role: user.role,
      name: user.name 
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

export async function getAuthToken() {
  const cookieStore = await cookies();
  return cookieStore.get(TOKEN_NAME)?.value;
}

export async function getCurrentUser() {
  const token = await getAuthToken();
  if (!token) return null;
  
  const decoded = verifyToken(token);
  if (!decoded) return null;
  
  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true, role: true }
    });
    return user;
  } catch (error) {
    return null;
  }
}

export async function isAuthenticated() {
  const user = await getCurrentUser();
  return !!user;
}

export async function isAdmin() {
  const user = await getCurrentUser();
  return user?.role === 'ADMIN';
}

export async function createInitialAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@chaovietnam.co.kr';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  
  const existingAdmin = await prisma.user.findFirst({
    where: { role: 'ADMIN' }
  });
  
  if (!existingAdmin) {
    const hashedPassword = await hashPassword(adminPassword);
    await prisma.user.create({
      data: {
        email: adminEmail,
        name: '관리자',
        password: hashedPassword,
        role: 'ADMIN'
      }
    });
    console.log(`Initial admin created: ${adminEmail}`);
    return true;
  }
  return false;
}

export { TOKEN_NAME };
