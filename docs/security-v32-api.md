# QUOZZ Security Engine V3.2

Base Git `6b106564b2296c7c9e155458a079f36a5663181b` trên `feature/quozz-control-v3.1`.

## Phạm vi truy cập

- Supabase Auth xác thực JWT. Backend lấy danh tính từ `auth.uid()` và phiên từ claim `session_id`, rồi đối chiếu với `auth.sessions`, chủ sở hữu và `not_after`. Các RPC yêu cầu đăng nhập dùng tài khoản Auth thường hoặc Admin được cấp quyền. Auth anonymous sign-in bị từ chối ở bước đối chiếu này.
- Phiên ứng dụng có UUID riêng. Mỗi phiên Auth có tối đa một phiên ứng dụng. Hết hạn tuyệt đối sau 12 giờ, hết hạn khi 5 phút không heartbeat. Heartbeat đề xuất mỗi 60 giây khi ứng dụng hoạt động, ghi tối đa một lần mỗi 15 giây mỗi phiên. Đăng ký lại dùng cùng UUID phiên Auth trả về phiên hiện hành và giữ thời hạn ban đầu. Phiên đã thu hồi hoặc hết hạn yêu cầu đăng nhập mới.
- Kick thu hồi một phiên ứng dụng. Ban thu hồi các phiên hiện có và chặn tài khoản đăng ký phiên hoặc truy cập tài nguyên khi còn bị khóa. Unban giữ nguyên trạng thái thu hồi của các phiên cũ. Admin được bảo vệ khỏi Ban qua RPC.
- Đăng xuất phía ứng dụng gọi `quozz_close_session` trước, rồi gọi Supabase Auth sign-out với phạm vi local và xóa token trong client. Thu hồi phiên ứng dụng và kết thúc phiên Supabase Auth là hai thao tác riêng. Đăng xuất Admin hiện tiếp tục dùng Supabase Auth. Các quyền Admin dựa vào phiên Auth còn hiệu lực và bảng `admins`.
- `quozz_get_resource` kiểm tra phiên, trạng thái bảo trì và hạn VIP trong mỗi lần đọc tài nguyên private. Dùng cùng điều kiện kiểm tra trên mỗi tài nguyên backend mới. `demo.html`, `display_config` và thông báo bảo trì là bề mặt công khai.
- Phiên cũ thiếu `auth_session_id` được giữ làm lịch sử. Chỉ xóa tombstone của phiên V3.2 sau khi phiên Auth tương ứng chắc chắn kết thúc. Xóa tombstone của phiên Auth còn hiệu lực sẽ cho phép phiên đó đăng ký app lại.

## HTTP

Gửi `POST /rest/v1/rpc/<tên>` qua HTTPS, có `apikey` publishable, `Authorization: Bearer <access_token>`, `Content-Type: application/json`. Thân request là JSON object, dùng `{}` cho hàm không có tham số. Các giá trị UUID và timestamp đi dưới dạng chuỗi, thời gian dùng ISO 8601 có timezone. Supabase gateway chịu trách nhiệm xác thực chữ ký JWT. Client không tự gửi claim hoặc UUID phiên Auth trong payload.

| RPC | Quyền | Payload | Kết quả |
| --- | --- | --- | --- |
| `quozz_register_session` | Auth hợp lệ, thành viên chưa bị khóa | `{"p_device":"Android"}` hoặc `{}` | `{id,expires_at,idle_timeout_seconds}`. Tạo hồ sơ còn thiếu. Nhãn thiết bị tùy chọn, tối đa 80 ký tự. |
| `quozz_heartbeat` | Phiên ứng dụng hợp lệ | `{}` | `{id,last_seen,expires_at}`. |
| `quozz_close_session` | Auth hợp lệ | `{}` | Boolean báo có ghi trạng thái thu hồi. Nếu chưa đăng ký app, tạo tombstone cho phiên Auth hiện tại. |
| `quozz_get_resource` | Phiên hợp lệ, còn VIP, bảo trì tắt | `{"p_slug":"membership"}` | `{content,vip_expires_at}`. `membership` đọc nội dung từ bảng private. |
| `quozz_kick` | Admin | `{"p_session_id":"<uuid-app>"}` | Boolean. Ghi nhật ký khi trạng thái đổi. |
| `quozz_set_ban` | Admin | `{"p_user_id":"<uuid>","p_banned":true}` | Boolean. Đổi trạng thái, thu hồi phiên khi Ban và ghi nhật ký trong cùng giao dịch. |
| `quozz_set_system` | Admin | `{"p_maintenance":true,"p_notice":"Bảo trì","p_expected_updated_at":"<timestamp>"}` | Dòng cấu hình mới gồm `updated_at`. Gửi `null` nếu dòng đọc từ server có `updated_at=null`. Thông báo tối đa 500 ký tự. |
| `quozz_issue_key` | Admin | `{"p_duration_days":30,"p_redeem_before":"<timestamp>"}` | `{id,key,redeem_before,duration_days}`. Thời hạn VIP 1–365 ngày. Hạn đổi ở tương lai tối đa 365 ngày. |
| `quozz_revoke_key` | Admin | `{"p_key_id":"<uuid>"}` | Boolean. Thu hồi khóa chưa dùng. Quyền VIP đã đổi bằng khóa khác hoặc đã cấp trước đó được giữ. |
| `quozz_redeem_key` | Phiên ứng dụng hợp lệ | `{"p_key":"<key>"}` | `{status:"redeemed",expires_at}`, `{status:"invalid"}` hoặc `{status:"rate_limited"}`. |
| `quozz_admin_data` | Admin | `{"p_kind":"overview"}` | Tổng `users`, `banned`, `sessions` và `online_users`. Online dựa trên Auth hợp lệ, phiên hiệu lực và hoạt động trong 2 phút. |
| `quozz_admin_data` | Admin | `{"p_kind":"profiles"}`, `{"p_kind":"sessions"}`, `{"p_kind":"keys"}` | 300 hồ sơ mới nhất, 300 phiên hoặc 100 khóa gần nhất. Danh sách khóa chỉ chứa metadata. |
| `quozz_admin_data` | Admin | `{"p_kind":"audit","p_before":123}` | Tối đa 50 dòng mới nhất. Bỏ `p_before` ở trang đầu. Trang sau dùng ID cuối của trang trước. |

Một thao tác Kick, Ban, Unban hoặc thu hồi khóa trả về `false` khi mục không tồn tại hoặc gọi lặp mà trạng thái không đổi. HTTP status cụ thể phụ thuộc mapping PostgREST. Client đọc thêm `code` và `message` của lỗi.

| SQLSTATE | Mã trong `message` | Cách xử lý |
| --- | --- | --- |
| `42501` | `AUTH_SESSION_REQUIRED`, `APP_SESSION_INACTIVE` | Đăng nhập lại. |
| `42501` | `PROFILE_ACCESS_DENIED`, `ADMIN_REQUIRED`, `ADMIN_TARGET_FORBIDDEN` | Hiển thị thông báo phù hợp và dừng thao tác. |
| `42501` | `MAINTENANCE`, `VIP_REQUIRED` | Hiển thị trạng thái bảo trì hoặc luồng đổi VIP Key. |
| `40001` | `SYSTEM_SETTINGS_CHANGED` | Đọc cài đặt mới trước khi lưu lại. |
| `22023` | `INVALID_DEVICE`, `INVALID_BAN_REQUEST`, `INVALID_SYSTEM_SETTINGS`, `INVALID_VIP_TERMS`, `INVALID_ADMIN_DATA_KIND` | Sửa payload. |
| `P0002` | `RESOURCE_NOT_FOUND` | Hiển thị tài nguyên không tồn tại. |

## VIP Key và dữ liệu vận hành

- Khóa ngẫu nhiên dùng một lần, trả giá trị gốc một lần khi tạo. Database lưu SHA-256 và metadata. Danh sách, nhật ký và bản vá không chứa khóa gốc. Quản trị viên chuyển khóa qua kênh riêng và tránh ghi request body đổi khóa ở proxy hoặc log ứng dụng.
- Mỗi tài khoản có tối đa 5 lần đổi trong cửa sổ 15 phút. Khóa không hợp lệ, hết hạn, bị thu hồi hoặc đã dùng trả cùng trạng thái `invalid`. Cấp VIP cộng thêm số ngày vào thời điểm lớn hơn giữa hiện tại và hạn đang có. Hạn đổi khóa và hạn VIP là hai mốc riêng.
- Nhật ký ghi Kick, Ban, Unban, lưu Settings, tạo/thu hồi/đổi VIP Key. Nhật ký và bảng VIP chỉ truy cập qua RPC được phép. Các thao tác trực tiếp của owner database và thay đổi Appearance nằm ngoài phạm vi nhật ký này. Ứng dụng quản trị giữ access token và refresh token trong bộ nhớ.
- RPC public là `SECURITY INVOKER`. Các hàm thao tác dữ liệu đặc quyền dùng `search_path = ''` trong schema `quozz_security`. Giữ schema đó ngoài danh sách **Exposed schemas**. `public.is_admin()` giữ hợp đồng boolean V3.1 và kiểm tra Auth session hợp lệ trước khi trả quyền Admin.
- Giao diện Users hiển thị hồ sơ ứng dụng được tạo khi đăng ký phiên. Bộ đếm độc lập với giới hạn danh sách. Phiên có trạng thái do server tính. Chưa có cơ chế tự động dọn nhật ký hoặc giới hạn tần suất đăng ký Auth theo IP. Áp dụng rate limit tầng Auth/gateway trên staging theo cấu hình dự án trước phát hành.

## Thứ tự triển khai và rollback

1. Đồng bộ nhánh phát triển, đối chiếu checksum và xem diff. Sao lưu schema hiện tại, `public.profiles`, `public.sessions`, hai bảng cấu hình và dữ liệu private V3.2 nếu đã tồn tại.
2. Trên **staging**, kiểm tra migration với PostgREST và Auth thật. Chạy luồng Admin, người dùng thường, token hết hạn, sign-out, hai trình duyệt đồng thời, rollback và chạy lại migration. Kiểm tra advisors sau DDL.
3. Với phê duyệt triển khai, áp dụng migration trước rồi phát hành frontend V3.2 ngay sau đó trong cửa sổ triển khai. Giữa hai bước, Admin V3.1 vẫn đọc dữ liệu và chỉnh Appearance, nhưng nút Kick/Ban/Settings cũ không ghi được vì quyền PATCH đã được thu hồi. Admin V3.2 cần RPC V3.2 khi nạp dashboard.
4. Rollback giữ profile, trạng thái banned/revoked và cấu hình hiện tại. SQL khôi phục RLS/grants V3.1, bỏ metadata ràng buộc phiên Auth cùng dữ liệu VIP/nhật ký private. Xuất dữ liệu V3.2 trước khi rollback. Rollback cũng khôi phục hạn chế bảo mật V3.1 đã tìm thấy. Khi dùng Supabase migration history, phối hợp rollback với bản điều chỉnh lịch sử migration trên đúng môi trường. Không chạy lại migration chỉ vì file vẫn có trong repo.
5. Khôi phục frontend bằng `git revert <commit-v3.2>`. Khôi phục cấu hình hoặc dữ liệu bị ảnh hưởng từ bản sao lưu khi cần. Ghi nhận thời điểm cắt chuyển để đối chiếu sự kiện quản trị.

[Tài liệu phiên Supabase Auth](https://supabase.com/docs/guides/auth/sessions)
