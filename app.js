//Import the require modules
const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()
app.use(express.json())

//database path
const databasePath = path.join(__dirname, 'twitterClone.db')
let db = null

//initialization and start the server
const initializationAndStartServer = async () => {
  try {
    db = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    })

    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (error) {
    console.log(`DB Error: ${error.message}`)
    process.exit(1)
  }
}

initializationAndStartServer()

//Authentication with JWT Token
const authenticateToken = (request, response, next) => {
  const authHeader = request.headers['authorization']
  let jwtToken

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1] // "Bearer token"
  }

  if (jwtToken === undefined) {
    response.status(401).send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_KEY', (error, payload) => {
      if (error) {
        response.status(401).send('Invalid JWT Token')
      } else {
        request.userId = payload.userId // stash user_id for later
        next()
      }
    })
  }
}

// API 1 : REGISTER API
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body

  const existingUser = await db.get('SELECT * FROM user WHERE username = ?;', [
    username,
  ])

  if (existingUser !== undefined) {
    response.status(400).send('User already exists')
  } else if (password.length < 6) {
    response.status(400).send('Password is too short')
  } else {
    const hashedPassword = await bcrypt.hash(password, 10)
    await db.run(
      'INSERT INTO user (name, username, password, gender) VALUES (?, ?, ?, ?);',
      [name, username, hashedPassword, gender],
    )
    response.send('User created successfully')
  }
})

//API :- LOGIN API >2
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const dbUser = await db.get('SELECT * FROM user WHERE username = ?', [
    username,
  ])

  if (!dbUser) {
    response.status(400).send('Invalid user')
  } else {
    const isMatch = await bcrypt.compare(password, dbUser.password)
    if (!isMatch) {
      response.status(400).send('Invalid password')
    } else {
      const payload = {userId: dbUser.user_id}
      const jwtToken = jwt.sign(payload, 'MY_SECRET_KEY')
      response.send({jwtToken})
    }
  }
})

//API : 3 GET METHOD user tweet feeed
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {userId} = request
  const query = `
    SELECT user.username, tweet.tweet, tweet.date_time AS dateTime
    FROM follower 
      INNER JOIN tweet ON follower.following_user_id = tweet.user_id
      INNER JOIN user ON tweet.user_id = user.user_id
    WHERE follower.follower_user_id = ?
    ORDER BY tweet.date_time DESC
    LIMIT 4;
  `
  const tweets = await db.all(query, [userId])
  response.send(tweets)
})

// API 4 : GET METGOD
app.get('/user/following/', authenticateToken, async (request, response) => {
  const {userId} = request
  const rows = await db.all(
    `SELECT user.name 
     FROM follower INNER JOIN user 
     ON follower.following_user_id = user.user_id 
     WHERE follower.follower_user_id = ?;`,
    [userId],
  )
  response.send(rows)
})

//API 5: GET METHOD
app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {userId} = request
  const rows = await db.all(
    `SELECT user.name 
     FROM follower INNER JOIN user 
     ON follower.follower_user_id = user.user_id 
     WHERE follower.following_user_id = ?;`,
    [userId],
  )
  response.send(rows)
})

//API 6: GET METHOD
app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  const {userId} = request
  const {tweetId} = request.params

  const accessQuery = `
    SELECT tweet.tweet, tweet.date_time AS dateTime
    FROM tweet 
      INNER JOIN follower 
      ON tweet.user_id = follower.following_user_id
    WHERE tweet.tweet_id = ? AND follower.follower_user_id = ?;
  `
  const tweet = await db.get(accessQuery, [tweetId, userId])
  if (!tweet) {
    response.status(401).send('Invalid Request')
  } else {
    const likes = await db.get(
      `SELECT COUNT(*) AS likes FROM like WHERE tweet_id = ?`,
      [tweetId],
    )
    const replies = await db.get(
      `SELECT COUNT(*) AS replies FROM reply WHERE tweet_id = ?`,
      [tweetId],
    )
    response.send({
      tweet: tweet.tweet,
      likes: likes.likes,
      replies: replies.replies,
      dateTime: tweet.dateTime,
    })
  }
})

//API 7: GET METHOD
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    const {userId} = request
    const {tweetId} = request.params

    const access = await db.get(
      `
    SELECT * FROM tweet 
      INNER JOIN follower 
      ON tweet.user_id = follower.following_user_id
    WHERE tweet.tweet_id = ? AND follower.follower_user_id = ?;
  `,
      [tweetId, userId],
    )

    if (!access) {
      response.status(401).send('Invalid Request')
    } else {
      const query = `
      SELECT user.username
      FROM like INNER JOIN user ON like.user_id = user.user_id
      WHERE like.tweet_id = ?;
    `
      const list = await db.all(query, [tweetId])
      response.send({likes: list.map(x => x.username)})
    }
  },
)

//API: 8 GET METHOD
app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    const {userId} = request
    const {tweetId} = request.params

    const access = await db.get(
      `
    SELECT * FROM tweet 
      INNER JOIN follower 
      ON tweet.user_id = follower.following_user_id
    WHERE tweet.tweet_id = ? AND follower.follower_user_id = ?;`,
      [tweetId, userId],
    )

    if (!access) {
      response.status(401).send('Invalid Request')
    } else {
      const rows = await db.all(
        `
      SELECT user.name, reply.reply
      FROM reply INNER JOIN user ON reply.user_id = user.user_id
      WHERE reply.tweet_id = ?;`,
        [tweetId],
      )
      response.send({replies: rows})
    }
  },
)

//API : GET METHOD
app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {userId} = request
  const query = `
    SELECT tweet.tweet,
           COUNT(DISTINCT like.like_id) AS likes,
           COUNT(DISTINCT reply.reply_id) AS replies,
           tweet.date_time AS dateTime
    FROM tweet
      LEFT JOIN like ON tweet.tweet_id = like.tweet_id
      LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
    WHERE tweet.user_id = ?
    GROUP BY tweet.tweet_id;
  `
  const tweets = await db.all(query, [userId])
  response.send(tweets)
})

//API :POST METHOD
app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {userId} = request
  const {tweet} = request.body
  const dateTime = new Date().toISOString().replace('T', ' ').split('.')[0]

  await db.run(
    `INSERT INTO tweet (tweet, user_id, date_time) VALUES (?, ?, ?);`,
    [tweet, userId, dateTime],
  )
  response.send('Created a Tweet')
})

//API : DELETE METHOD
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {userId} = request
    const {tweetId} = request.params

    const tweet = await db.get(
      `SELECT * FROM tweet WHERE tweet_id = ? AND user_id = ?;`,
      [tweetId, userId],
    )

    if (!tweet) {
      response.status(401).send('Invalid Request')
    } else {
      await db.run(`DELETE FROM tweet WHERE tweet_id = ?;`, [tweetId])
      response.send('Tweet Removed')
    }
  },
)

module.exports = app

/*
  git config --global user.email naikc8468@gmail.com
    git config --global user.name Chetannaik-9535
     git remote add origin https://github.com/Chetannaik-9535/Twitter.git
*/