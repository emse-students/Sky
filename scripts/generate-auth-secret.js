#!/usr/bin/env node
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

function generateAuthSecret() {
	return crypto.randomBytes(32).toString('hex');
}

console.log('\n🔐 Générateur de AUTH_SECRET pour Sky\n');

const secret = generateAuthSecret();
console.log('✅ Nouvelle clé AUTH_SECRET générée :');
console.log(`   ${secret}\n`);

const envPath = path.join(process.cwd(), '.env');

if (fs.existsSync(envPath)) {
    let content = fs.readFileSync(envPath, 'utf8');
    if (content.includes('AUTH_SECRET=')) {
        console.log('⚠️  AUTH_SECRET existe déjà dans .env. Remplacement...');
        content = content.replace(/AUTH_SECRET=.*/g, `AUTH_SECRET=${secret}`);
    } else {
        console.log('➕ Ajout de AUTH_SECRET à .env');
        content += `\nAUTH_SECRET=${secret}\n`;
    }
    fs.writeFileSync(envPath, content);
    console.log('✅ .env mis à jour.');
} else {
    console.log('📄 Création de .env');
    fs.writeFileSync(envPath, `AUTH_SECRET=${secret}\n`);
    console.log('✅ .env créé.');
}
