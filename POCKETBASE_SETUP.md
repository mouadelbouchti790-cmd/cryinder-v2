# PocketBase Schema — cryinder_users collection

collection: cryinder_users

fields:
  wallet_address:
    type: text
    required: true
    unique: true
    min: 32
    max: 44

  username:
    type: text
    required: false
    min: 3
    max: 20

  username_set:
    type: bool
    default: false

  username_changed_at:
    type: date
    required: false

api_rules:
  list:   @request.auth.id != ''        # only authenticated users can list
  view:   @request.auth.id != ''        # only authenticated users can view
  create: admin_only = true             # only via admin auth (or disable create)
  update: admin_only = true             # only via admin auth (or disable update)
  delete: admin_only = true             # only via admin auth (or disable delete)

# Environment variables for .env:
# VITE_PB_URL=http://127.0.0.1:8090
# VITE_PB_ADMIN_EMAIL=your_admin@email.com
# VITE_PB_ADMIN_PASSWORD=your_admin_password
