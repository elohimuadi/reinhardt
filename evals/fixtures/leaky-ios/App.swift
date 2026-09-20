import FBSDKCoreKit
import Sentry
ApplicationDelegate.shared.initializeSDK()
SentrySDK.start { options in options.dsn = "https://public@example.ingest.sentry.io/1" }
