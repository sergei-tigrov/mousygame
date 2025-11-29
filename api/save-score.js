/**
 * ⭐ Vercel Function - Безопасное сохранение скоров в GitHub
 *
 * Получает POST запрос с {name, score, level}
 * Обновляет leaderboard.json в GitHub репо
 * Токен GitHub хранится в переменных окружения (SAFE!)
 */

export default async function handler(req, res) {
    // ⭐ CORS headers для фронтенда
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    // Обработка preflight запроса
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Только POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { name, score, level } = req.body;

        // ✅ Валидация
        if (!name || score === undefined || level === undefined) {
            return res.status(400).json({ error: 'Missing required fields: name, score, level' });
        }

        if (typeof name !== 'string' || name.length > 50) {
            return res.status(400).json({ error: 'Invalid name (max 50 chars)' });
        }

        if (!Number.isInteger(score) || score < 0 || score > 999999) {
            return res.status(400).json({ error: 'Invalid score (0-999999)' });
        }

        if (!Number.isInteger(level) || level < 1 || level > 50) {
            return res.status(400).json({ error: 'Invalid level (1-50)' });
        }

        // ⭐ GitHub информация
        const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
        const REPO_OWNER = 'sergei-tigrov';
        const REPO_NAME = 'mousygame';
        const FILE_PATH = 'leaderboard.json';

        if (!GITHUB_TOKEN) {
            console.error('❌ GITHUB_TOKEN не установлен в env переменных!');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // 1️⃣ Получаем текущий файл из GitHub
        const getResponse = await fetch(
            `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,
            {
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'mousygame-leaderboard'
                }
            }
        );

        if (!getResponse.ok) {
            throw new Error(`Failed to fetch file: ${getResponse.status}`);
        }

        const fileData = await getResponse.json();
        const currentContent = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf-8'));

        // 2️⃣ Добавляем новый скор
        const newScore = {
            name: name.trim(),
            score: score,
            level: level,
            date: new Date().toISOString().split('T')[0]
        };

        currentContent.scores.push(newScore);

        // 3️⃣ Сортируем по очкам (высший сначала)
        currentContent.scores.sort((a, b) => b.score - a.score);

        // 4️⃣ Ограничиваем топ-100 (экономим место)
        if (currentContent.scores.length > 100) {
            currentContent.scores = currentContent.scores.slice(0, 100);
        }

        // 5️⃣ Обновляем время
        currentContent.lastUpdated = new Date().toISOString();

        // 6️⃣ Обновляем файл в GitHub
        const updateResponse = await fetch(
            `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'mousygame-leaderboard',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `🏆 Новый скор: ${name} - ${score} очков (Уровень ${level})`,
                    content: Buffer.from(JSON.stringify(currentContent, null, 2)).toString('base64'),
                    sha: fileData.sha,
                    committer: {
                        name: 'Mousygame Leaderboard Bot',
                        email: 'bot@mousygame.local'
                    }
                })
            }
        );

        if (!updateResponse.ok) {
            throw new Error(`Failed to update file: ${updateResponse.status}`);
        }

        // ✅ Успешно! Возвращаем обновленный рейтинг
        console.log(`✅ Score saved: ${name} - ${score} points`);

        return res.status(200).json({
            success: true,
            message: 'Score saved successfully',
            playerScore: newScore,
            topScores: currentContent.scores.slice(0, 10)
        });

    } catch (error) {
        console.error('❌ Error saving score:', error.message);
        return res.status(500).json({
            error: 'Failed to save score',
            message: error.message
        });
    }
}
