const express = require('express')

const app = express()
app.use(express.json())

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const dbpath = path.join(__dirname, 'twitterClone.db')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

let db = null

const InitializeDBandServer = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server running at http:/localhost:3000/')
    })
  } catch (e) {
    console.log(e.message)
  }
}
InitializeDBandServer()

//GETTING ARRAY OF USERS FOLLWERS ID

const getFollowingPeopleIdsOfUser = async username => {
  const getFollowingPeopleQuery = `
    SELECT following_user_id FROM follower INNER JOIN user ON user.user_id = follower_user_id
    WHERE user.username='${username};'`
  const followingpeople = await db.all(getFollowingPeopleQuery)
  const arrayofIds = followingpeople.map(eachUser => eachUser.following_user_id)
  return arrayofIds
}

//AUTHENTICATION TOKEN
const authentication = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken) {
    jwt.verify(jwtToken, 'SECRET_KEY', (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        request.userId = payload.userId
        next()
      }
    })
  } else {
    response.status(401)
    response.send('Invalid JWT Token')
  }
}

/// TWEET ACCESS VERIFICATION
const tweetAcessVeification = async (request, response, next) => {
  const {userId} = request
  const {tweetId} = request.params
  const getTweetQuery = `
  SELECT * 
  FROM 
  tweet INNER JOIN follower 
  ON tweet.user_id = follower.follower_user_id
  WHERE 
    tweet.tweet_id = '${tweetId}' AND follower_user_id = '${userId};'`
  const tweet = await db.get(getTweetQuery)
  if (tweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    next()
  }
}

/// API 1
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const getUserQuery = `'SELECT * FROM user WHERE username = '${username}'`

  const userDetails = await db.get(getUserQuery)
  if (userDetails !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    // senario 2
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      // senario 3
      const hasedPassword = await bcrypt.hash(password, 10)
      const createUserQuery = `INSERT INTO user(username, password, name, gender)
      VALUES ('${username}','${hasedPassword}','${name}','${gender}')`
      await db.run(createUserQuery)
      response.send('User created successfully')
    }
  }
})

////API 2
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const getUserQuery = `'SELECT * FROM user WHERE username = '${username}'`

  const userDetails = await db.get(getUserQuery)
  if (userDetails !== undefined) {
    const isPasswordMatched = await bcrypt.compare(
      password,
      hasedPassword.password,
    )
    if (isPasswordMatched) {
      const payload = {username, userId: userDetails.user_id}
      const jwtToken = jwt.sign(payload, 'SECRET_KEY')
      response.send({jwtToken})
    } else {
      // senario 2
      response.status(400)
      response.send('Invalid password')
    }
  } else {
    response.status(400)
    response.send('Invalid user')
  }
})

//  API 3

app.get('/user/tweets/feed/', authentication, async (request, response) => {
  const {username} = request
  const followingPeopleIds = await getFollowingPeopleIdsOfUser(username)

  const getTweetsQuery = ` SELECT username,tweet ,date_time as dateTime
  FROM 
  user INNER JOIN tweet
   ON user.user_id = tweet.user_id
  WHERE
  user.user_id IN (${followingPeopleIds})
  ORDER BY 
  date_time DESC LIMIT 4;`

  const tweets = await db.all(getTweetsQuery)
  response.send(tweets)
})

/// API 4

app.get('/user/following/', authentication, async (request, response) => {
  const {username, userId} = request
  const getFollowingQuery = `
  SELECT name 
  FROM 
  follower INNER JOIN user ON
   user.user_id = follower.following_user_id
  WHERE
  following_user_id = '${userId}';`
  const followingPeople = await db.all(getFollowingQuery)
  response.send(followingPeople)
})

/// API 5
app.get('/user/followers/', authentication, async (request, response) => {
  const {username, userId} = request
  const getFollowingQuery = `
  SELECT DISTINCT name 
  FROM 
  follower INNER JOIN user ON
   user.user_id = follower.following_user_id
  WHERE
  following_user_id = '${userId}';`
  const followers = await db.all(getFollowingQuery)
  response.send(followers)
})

// API 6

app.get('/tweets/:tweetId/', authentication, async (request, response) => {
  const {username, userId} = request
  const {tweetId} = request.params

  const getTweets = ` SELECT tweet 
  (SELECT COUNT () FROM  like  WHERE tweet_id = '${tweetId}') AS likes,
  (SELECT COUNT () FROM  reply  WHERE tweet_id = '${tweetId}') AS replies,
  date_time AS dateTime
  FROM
  tweet 
  WHERE 
  tweet.tweet_id = '${tweetId}';`
  const tweet = await db.get(getTweets)
  if (tweet === undefined) {
    response.status(400)
    response.send('Invalid Request')
  } else {
    response.send(tweet)
  }
})

/// API 7

app.get(
  '/tweets/:tweetId/likes/',
  authentication,
  async (request, response) => {
    const {tweetId} = request.params
    const getlikesQuery = ` SELECT username
  FROM user INNER JOIN like 
  ON  user.user_id = like.user_id 
  WHERE 
  tweet.tweet_id = '${tweetId}'; `
    const likedUsers = await db.all(getlikesQuery)
    const userArray = likedUsers.map(eachUser => eachUser.username)
    if (userArray === undefined) {
      response.status(401)
      response.send('Invalid Requset')
    } else {
      response.send({likes: userArray})
    }
  },
)
/// API 8
app.get(
  '/tweets/:tweetId/replies/',
  authentication,
  async (request, response) => {
    const {tweetId} = request.params
    const getreplyQuery = ` SELECT name,reply 
  FROM user INNER JOIN reply 
  ON  user.user_id = reply.user_id 
  WHERE 
  tweet.tweet_id = '${tweetId}'; `
    const repliedUsers = await db.all(getreplyQuery)
    if (repliedUsers === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      response.send({replies: repliedUsers})
    }
  },
)
/// API 9
app.get('/user/tweets/', authentication, async (request, response) => {
  const {userId} = request
  const getTweetQuery = `
  SELECT
  tweet,
  COUNT()
  COUNT()
  date_time AS dateTime
  
  FROM
  tweet LEFT JOIN reply ON  tweet.tweet_id = reply.tweet_id
   LEFT JOIN like  ON   tweet.tweet_id = like.tweet_id
  WHERE 
  tweet.user_id = ${userId}
  GROUP BY 
  tweet.tweet_id;`
  const tweets = await db.get(getTweetQuery)
  response.send(tweets)
})
/// API 10
app.post('/user/tweets/', authentication, async (request, response) => {
  const {tweet} = request.body
  const userId = parseInt(request.userId)
  const creteTweetQuery = `
  INSERT INTO tweet(tweet,user_id,date_time) 
  VALUES ('${tweet}','${userId}','${dateTime}');`
  await db.run(creteTweetQuery)
  response.send('Created a Tweet')
})
/// API 11
app.delete('/tweets/:tweetId/', authentication, async (request, response) => {
  const {tweetId} = request.params
  const {userId} = request

  const getTHEQuery = `SELECT * FROM tweet WHERE user_id = '${userId}' AND tweet_id = '${tweetId}';`
  const tweet = await db.get(getTHEQuery)

  if (tweet === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    const deletetweetquery = `DELETE FROM   tweet WHERE tweet_id = '${tweetId}'; `
    await db.run(deletetweetquery)
    response.send('Tweet Removed')
  }
})

module.exports = app
