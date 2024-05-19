# Proof-of-work Captcha Verification

You can require users to complete a proof-of-work before they can access the
proxy. This can increase the cost of denial of service attacks and slow down
automated abuse.

When configured, users access the challenge UI and request a proof of work. The
server will generate a challenge according to the difficulty level you have set.
The user can then start the worker to solve the challenge. Once the challenge is
solved, the user can submit the solution to the server. The server will verify
the solution and issue a temporary token for that user.

## Configuration

To enable the proof-of-work captcha, set the following environment variables:

```
GATEKEEPER=user_token
CAPTCHA_MODE=proof_of_work
# Validity of the token in hours
CAPTCHA_TOKEN_HOURS=24
# Max number of IPs that can use a user_token issued via proof-of-work
CAPTCHA_TOKEN_MAX_IPS=2
# The difficulty level of the proof-of-work challenge
CAPTCHA_POW_DIFFICULTY_LEVEL=low
```

## Difficulty Levels

The difficulty level controls how long it takes to solve the proof-of-work,
specifically by adjusting the average number of iterations required to find a
valid solution. Due to randomness, the actual number of iterations required can
vary significantly.

### Extreme

### High

### Medium

### Low

## Custom argon2id parameters

You can set custom argon2id parameters for the proof-of-work challenge.
Generally, you should not need to change these unless you have a specific
reason to do so.

The listed values are the defaults.

```
ARGON2_TIME_COST=6
ARGON2_MEMORY_KB=65536
ARGON2_PARALLELISM=4
ARGON2_HASH_LENGTH=32
```

Keep in mind that to verify submitted solutions, the server will need to
allocate memory equal to `ARGON2_MEMORY_KB * ARGON2_PARALLELISM`. Therefore,
when running on memory-constrained systems, you may need to reduce the memory
cost and increase the time cost to compensate.
