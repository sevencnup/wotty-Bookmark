use aes_gcm::{
    aead::{consts::U16, Aead, KeyInit},
    Aes256Gcm, AesGcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use pbkdf2::pbkdf2_hmac;
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::{env, fs, io::Write, path::Path};
use uuid::Uuid;

const MASTER_KEY_ENV: &str = "BOOKMARK_VAULT_MASTER_KEY";
const MASTER_KEY_FILE: &str = "server-master.key";
const MASTER_KEY_BYTES: usize = 32;
const ENVELOPE_NONCE_BYTES: usize = 12;
const FLOCCUS_ITERATIONS: u32 = 250_000;
const FLOCCUS_IV_BYTES: usize = 16;
const FLOCCUS_SALT_BYTES: usize = 64;

type FloccusAes256Gcm = AesGcm<aes_gcm::aes::Aes256, U16>;

#[derive(Clone)]
pub struct MasterKey([u8; MASTER_KEY_BYTES]);

#[derive(Debug, Clone)]
pub struct SealedPassphrase {
    pub key_version: i64,
    pub nonce: Vec<u8>,
    pub ciphertext: Vec<u8>,
}

#[derive(Debug, Deserialize, Serialize)]
struct FloccusPayload {
    ciphertext: String,
    salt: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CryptoError {
    InvalidConfiguration(String),
    InvalidPayload,
    AuthenticationFailed,
    Io(String),
}

impl std::fmt::Display for CryptoError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidConfiguration(message) | Self::Io(message) => formatter.write_str(message),
            Self::InvalidPayload => formatter.write_str("加密数据格式无效"),
            Self::AuthenticationFailed => formatter.write_str("加密数据验证失败"),
        }
    }
}

impl std::error::Error for CryptoError {}

impl MasterKey {
    #[cfg(test)]
    pub fn for_tests() -> Self {
        Self([7_u8; MASTER_KEY_BYTES])
    }

    pub fn load_or_create(data_dir: &Path) -> Result<Self, CryptoError> {
        if let Ok(encoded) = env::var(MASTER_KEY_ENV) {
            return Self::from_base64(encoded.trim()).map_err(|_| {
                CryptoError::InvalidConfiguration(format!(
                    "{MASTER_KEY_ENV} 必须是 32 字节主密钥的标准 Base64 编码"
                ))
            });
        }

        fs::create_dir_all(data_dir).map_err(|error| CryptoError::Io(error.to_string()))?;
        let path = data_dir.join(MASTER_KEY_FILE);
        match fs::read_to_string(&path) {
            Ok(encoded) => Self::from_base64(encoded.trim()).map_err(|_| {
                CryptoError::InvalidConfiguration(format!("{} 中的主密钥格式无效", path.display()))
            }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let mut bytes = [0_u8; MASTER_KEY_BYTES];
                OsRng.fill_bytes(&mut bytes);
                let encoded = STANDARD.encode(bytes);
                let mut options = fs::OpenOptions::new();
                options.write(true).create_new(true);
                let mut file = options
                    .open(&path)
                    .map_err(|error| CryptoError::Io(error.to_string()))?;
                file.write_all(encoded.as_bytes())
                    .and_then(|_| file.sync_all())
                    .map_err(|error| CryptoError::Io(error.to_string()))?;
                tracing::warn!(path = %path.display(), "generated server master key; back up this file with the database");
                Ok(Self(bytes))
            }
            Err(error) => Err(CryptoError::Io(error.to_string())),
        }
    }

    fn from_base64(encoded: &str) -> Result<Self, CryptoError> {
        let bytes = STANDARD
            .decode(encoded)
            .map_err(|_| CryptoError::InvalidConfiguration("主密钥 Base64 无效".into()))?;
        let key: [u8; MASTER_KEY_BYTES] = bytes
            .try_into()
            .map_err(|_| CryptoError::InvalidConfiguration("主密钥长度必须为 32 字节".into()))?;
        Ok(Self(key))
    }

    pub fn seal_passphrase(
        &self,
        user_id: Uuid,
        passphrase: &str,
    ) -> Result<SealedPassphrase, CryptoError> {
        let cipher = Aes256Gcm::new_from_slice(&self.0).map_err(|_| CryptoError::InvalidPayload)?;
        let mut nonce = [0_u8; ENVELOPE_NONCE_BYTES];
        OsRng.fill_bytes(&mut nonce);
        let aad = envelope_aad(user_id, 1);
        let ciphertext = cipher
            .encrypt(
                Nonce::from_slice(&nonce),
                aes_gcm::aead::Payload {
                    msg: passphrase.as_bytes(),
                    aad: aad.as_bytes(),
                },
            )
            .map_err(|_| CryptoError::AuthenticationFailed)?;
        Ok(SealedPassphrase {
            key_version: 1,
            nonce: nonce.to_vec(),
            ciphertext,
        })
    }

    pub fn open_passphrase(
        &self,
        user_id: Uuid,
        sealed: &SealedPassphrase,
    ) -> Result<String, CryptoError> {
        if sealed.key_version != 1 || sealed.nonce.len() != ENVELOPE_NONCE_BYTES {
            return Err(CryptoError::InvalidPayload);
        }
        let cipher = Aes256Gcm::new_from_slice(&self.0).map_err(|_| CryptoError::InvalidPayload)?;
        let aad = envelope_aad(user_id, sealed.key_version);
        let plaintext = cipher
            .decrypt(
                Nonce::from_slice(&sealed.nonce),
                aes_gcm::aead::Payload {
                    msg: &sealed.ciphertext,
                    aad: aad.as_bytes(),
                },
            )
            .map_err(|_| CryptoError::AuthenticationFailed)?;
        String::from_utf8(plaintext).map_err(|_| CryptoError::InvalidPayload)
    }
}

fn envelope_aad(user_id: Uuid, key_version: i64) -> String {
    format!("bookmark-vault:floccus-passphrase:v{key_version}:{user_id}")
}

pub fn is_floccus_encrypted(bytes: &[u8]) -> bool {
    parse_payload(bytes).is_ok()
}

pub fn decrypt_floccus(bytes: &[u8], passphrase: &str) -> Result<Vec<u8>, CryptoError> {
    let payload = parse_payload(bytes)?;
    let salt = validate_salt(&payload.salt)?;
    let combined = STANDARD
        .decode(payload.ciphertext)
        .map_err(|_| CryptoError::InvalidPayload)?;
    if combined.len() < FLOCCUS_IV_BYTES + 16 {
        return Err(CryptoError::InvalidPayload);
    }
    let (iv, ciphertext) = combined.split_at(FLOCCUS_IV_BYTES);
    let key = derive_floccus_key(passphrase, salt);
    let cipher = FloccusAes256Gcm::new_from_slice(&key).map_err(|_| CryptoError::InvalidPayload)?;
    cipher
        .decrypt(aes_gcm::Nonce::<U16>::from_slice(iv), ciphertext)
        .map_err(|_| CryptoError::AuthenticationFailed)
}

pub fn encrypt_floccus(plaintext: &[u8], passphrase: &str) -> Result<Vec<u8>, CryptoError> {
    let mut salt_bytes = [0_u8; FLOCCUS_SALT_BYTES];
    OsRng.fill_bytes(&mut salt_bytes);
    let salt = hex_encode(&salt_bytes);
    let key = derive_floccus_key(passphrase, salt.as_bytes());
    let cipher = FloccusAes256Gcm::new_from_slice(&key).map_err(|_| CryptoError::InvalidPayload)?;
    let mut iv = [0_u8; FLOCCUS_IV_BYTES];
    OsRng.fill_bytes(&mut iv);
    let ciphertext = cipher
        .encrypt(aes_gcm::Nonce::<U16>::from_slice(&iv), plaintext)
        .map_err(|_| CryptoError::AuthenticationFailed)?;
    let mut combined = Vec::with_capacity(iv.len() + ciphertext.len());
    combined.extend_from_slice(&iv);
    combined.extend_from_slice(&ciphertext);
    serde_json::to_vec(&FloccusPayload {
        ciphertext: STANDARD.encode(combined),
        salt,
    })
    .map_err(|_| CryptoError::InvalidPayload)
}

fn parse_payload(bytes: &[u8]) -> Result<FloccusPayload, CryptoError> {
    serde_json::from_slice(bytes).map_err(|_| CryptoError::InvalidPayload)
}

fn validate_salt(salt: &str) -> Result<&[u8], CryptoError> {
    if salt.len() != FLOCCUS_SALT_BYTES * 2 || !salt.as_bytes().iter().all(u8::is_ascii_hexdigit) {
        return Err(CryptoError::InvalidPayload);
    }
    Ok(salt.as_bytes())
}

fn derive_floccus_key(passphrase: &str, salt: &[u8]) -> [u8; 32] {
    let mut key = [0_u8; 32];
    pbkdf2_hmac::<Sha256>(passphrase.as_bytes(), salt, FLOCCUS_ITERATIONS, &mut key);
    key
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        use std::fmt::Write as _;
        let _ = write!(output, "{byte:02x}");
    }
    output
}

#[cfg(test)]
mod tests {
    use super::{decrypt_floccus, encrypt_floccus, MasterKey};
    use uuid::Uuid;

    #[test]
    fn floccus_round_trip_uses_authenticated_json_payload() {
        let plaintext = b"<?xml version=\"1.0\" encoding=\"UTF-8\"?><xbel></xbel>";
        let encrypted = encrypt_floccus(plaintext, "correct horse battery staple")
            .expect("encryption succeeds");
        let value: serde_json::Value = serde_json::from_slice(&encrypted).expect("JSON payload");
        assert_eq!(value["salt"].as_str().expect("salt").len(), 128);
        assert_eq!(
            decrypt_floccus(&encrypted, "correct horse battery staple")
                .expect("decryption succeeds"),
            plaintext
        );
        assert!(decrypt_floccus(&encrypted, "wrong").is_err());
    }

    #[test]
    fn decrypts_a_floccus_5_10_2_webcrypto_vector() {
        let payload = br#"{"ciphertext":"AAECAwQFBgcICQoLDA0OD7F+k5OGKwCS5oRNwfv9z5uLFhz5BTk7unioebVMUAKffsxTx8QfbW1zFVwAfO+CO0tBWehUMKJi5MQ6+c2CvcqnhkTxhoEULH8OXJN/3bcMaA==","salt":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"}"#;
        assert_eq!(
            decrypt_floccus(payload, "Floccus 5.10.2 compatibility 密码")
                .expect("Floccus vector decrypts"),
            br#"<?xml version="1.0" encoding="UTF-8"?><xbel version="1.0"></xbel>"#
        );
    }

    #[test]
    fn passphrase_envelope_is_bound_to_its_user() {
        let key = MasterKey::for_tests();
        let alice = Uuid::new_v4();
        let bob = Uuid::new_v4();
        let sealed = key.seal_passphrase(alice, "floccus secret").expect("seal");
        assert_eq!(
            key.open_passphrase(alice, &sealed).expect("open"),
            "floccus secret"
        );
        assert!(key.open_passphrase(bob, &sealed).is_err());
    }
}
