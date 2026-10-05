import CryptoKit
import Foundation

struct SessionStore {
    func save(_ accessToken: String) {
        UserDefaults.standard.set(accessToken, forKey: "accessToken")
        print("saved token \(accessToken)")
    }
    func fingerprint(_ data: Data) -> String {
        Insecure.MD5.hash(data: data).description
    }
}
