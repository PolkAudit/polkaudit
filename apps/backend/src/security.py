from datetime import datetime, timedelta
from typing import Optional, Union, Any
from jose import jwt
from passlib.context import CryptContext
from src.config import settings

# Password hashing
# pin bcrypt<4.1 via requirements — 4.1+ breaks passlib with a false "72 bytes" error
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT Configuration
ALGORITHM = "HS256"
# Using a default secret for dev if not set, but logically should be in settings
SECRET_KEY = settings.API_KEY # Reusing API Key as secret or ideally a separate SECRET_KEY


def _bcrypt_safe_password(password: str) -> str:
    """bcrypt only uses the first 72 bytes; normalize to avoid backend 500s."""
    raw = password.encode("utf-8")
    if len(raw) <= 72:
        return password
    return raw[:72].decode("utf-8", errors="ignore")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(_bcrypt_safe_password(plain_password), hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(_bcrypt_safe_password(password))

def create_access_token(subject: Union[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=30)
    
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
