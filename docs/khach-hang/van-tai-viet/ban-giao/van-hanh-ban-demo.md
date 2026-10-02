# Vận hành bản demo

> **Tài liệu demo/legacy** — xem [“Giới thiệu hệ thống cho lãnh đạo”](gioi-thieu-he-thong-cho-lanh-dao.md) để biết luồng hiện tại.
>
> Áp dụng cho stack **máy ảo cũ**; bản demo hiện tại chạy ở nơi khác. Mục sao lưu/phục hồi giữ để
> tra cứu.
>
> **Không chạy lệnh làm lại dữ liệu** (`reset-transport-demo.mjs`) trên bản demo hiện tại: lệnh
> này không xoá được dữ liệu đơn hàng và vòng xe nên dừng giữa chừng, và bản demo hiện tại không
> chạy trên máy ảo mô tả ở đây.

Ba việc người vận hành cần làm được mà không cần lập trình viên: **sao lưu**, **phục hồi**, và
**đưa bản demo về trạng thái đầu**.

Mọi lệnh dưới đây chạy trên VM, trong thư mục stack:

```bash
cd /srv/netviet/apps/zalo-transport-preview-gd1-test
```

> **`docker compose` ở đây luôn cần `--env-file`.** Thiếu nó, lệnh chết với một thông báo nói về
> `extra_hosts` và không nhắc gì tới biến môi trường — một chỉ dẫn sai hướng đã làm mất thời gian
> nhiều lần. Đoạn nạp đúng:
>
> ```bash
> source ./stack-compose.sh
> netviet_load_stack_composition
> COMPOSE=(sudo docker compose --env-file .runtime/secrets.env "${NETVIET_COMPOSE_FILES[@]}")
> ```

---

## 1. Sao lưu

```bash
sudo ./backup.sh
```

Xuất toàn bộ PostgreSQL của stack rồi đẩy lên
`gs://netviet-host-968934832433-backups/stacks/transport-preview-gd1-test/`.

Mỗi stack có **cửa sổ lưu trữ riêng** — bảy đêm của chính nó. Trước đây mọi stack dồn vào chung một
thư mục, nên hai stack chia đôi cửa sổ của nhau và nhìn một bản dump thì không biết nó của ai.

Kiểm bản vừa tạo:

```bash
gcloud storage ls gs://netviet-host-968934832433-backups/stacks/transport-preview-gd1-test/daily/
```

**Chạy sao lưu trước mỗi buổi demo và trước mỗi lần xoá dữ liệu.**

---

## 2. Phục hồi

> Phục hồi vào **một cơ sở dữ liệu riêng trước**, kiểm dữ liệu trong đó, rồi mới quyết định có
> chuyển sang bản đang chạy không. Phục hồi thẳng đè lên bản đang chạy là cách mất cả hai bản.

```bash
# 1. Tải bản dump về
gcloud storage cp gs://.../stacks/transport-preview-gd1-test/daily/<stamp>/zalo-<stamp>.dump /tmp/

# 2. Tạo một CSDL RIÊNG để phục hồi vào
"${COMPOSE[@]}" exec -T postgres createdb -U postgres zalo_restore_check

# 3. Phục hồi vào đó
"${COMPOSE[@]}" exec -T postgres pg_restore -U postgres -d zalo_restore_check < /tmp/zalo-<stamp>.dump

# 4. Kiểm bằng chính dữ liệu nghiệp vụ, không phải bằng "lệnh chạy xong không lỗi"
"${COMPOSE[@]}" exec -T postgres psql -U postgres -d zalo_restore_check \
  -c 'select count(*) from "TransportTrip";' \
  -c 'select code, status, "businessDate" from "TransportTrip" order by "businessDate" desc limit 5;'

# 5. Xoá CSDL kiểm sau khi xong
"${COMPOSE[@]}" exec -T postgres dropdb -U postgres zalo_restore_check
```

Thủ tục này đã chạy thật: một bản dump **334.668 byte** phục hồi vào một CSDL riêng, đọc ra được
chuyến, phiếu lương và tài khoản trong đó, rồi xoá — bản đang chạy không hề bị động tới, số đếm
trước và sau y nguyên.

**Số đếm khác không, và một hàng cụ thể đọc đúng** là điều kiện để gọi một lần phục hồi là thành
công. `pg_restore` kết thúc không lỗi trên một bản dump rỗng cũng cho ra mã thoát 0.

---

## 3. Đưa bản demo về trạng thái đầu

> ⛔ **Không dùng mục này cho bản demo hiện tại** — xem cảnh báo ở đầu tài liệu.

Sau một buổi demo, dữ liệu đã có thêm chuyến, phiếu, kỳ lương do người xem tạo ra. Lệnh này xoá
sạch dữ liệu vận tải rồi gieo lại đúng tháng vận hành mẫu:

```bash
"${COMPOSE[@]}" --profile tools run --rm --no-deps \
  -e TENANT_DIR=/srv/tenant \
  -e TRANSPORT_DEMO_RESET=xoa-va-gieo-lai \
  bootstrap node deploy/netviet/reset-transport-demo.mjs
```

Kết quả in ra hai dòng: số bản ghi đã xoá theo từng bảng, và số bản ghi đã gieo lại. Dòng thứ hai
**phải có** `staffLogins=1 driverLogins=12` — xem cảnh báo ngay dưới.

> ### Phải là `bootstrap`, không phải `api`
>
> Chạy lệnh này qua `api exec` thì nó **vẫn chạy xong, vẫn in ra đầy đủ số liệu đã gieo**, và lặng
> lẽ để lại một bản demo **không ai đăng nhập được** ở màn hình lái xe lẫn kế toán.
>
> Lý do: `TRANSPORT_DEMO_DRIVER_PASSWORD` chỉ được gán cho service `bootstrap` trong `compose.yaml`,
> có ý để giá trị không bao giờ xuất hiện trong bảng tiến trình của VM. Chạy ở `api` thì biến đó
> vắng, và bước tạo tài khoản bị bỏ qua.
>
> Dấu hiệu duy nhất là một dòng log dễ đọc lướt qua:
> `Khong tao tai khoan dang nhap cho lai xe: thieu TRANSPORT_DEMO_DRIVER_PASSWORD`.
>
> **Cách kiểm sau mỗi lần làm lại:** dòng kết quả phải có `staffLogins=1 driverLogins=12`. Không
> có hai số đó thì đăng nhập thử một tài khoản lái xe trước khi rời máy.

### Ba cổng chặn, và vì sao chúng ở đó

| Cổng                                         | Chặn điều gì                                                                                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Gói khách phải khai `readiness.demoTenant`   | Không gói khách **thật** nào khai cờ này, và có bài kiểm khoá cả hai chiều. Lệnh này vì thế không thể chạy nhầm lên stack của một khách hàng. |
| `TRANSPORT_DEMO_RESET=xoa-va-gieo-lai`       | Một câu gõ tay, không phải một cờ `--force`.                                                                                                  |
| `DemoTenantGuardError` là một loại lỗi riêng | Bắt theo **loại** nên một lỗi thật (mất kết nối CSDL, lệch schema) không bao giờ bị đọc nhầm thành "gói này không phải gói mẫu" rồi bị nuốt.  |

### Lệnh này **không** đụng vào

- Tài khoản vận hành (`operator`) — nó không nối vào dữ liệu mẫu nên không nằm trong danh sách xoá
- Nhật ký kiểm toán
- Bất kỳ bảng nào của miền bán hàng
- Bất kỳ stack nào khác trên cùng VM

> Tài khoản lái xe và tài khoản kế toán mẫu **bị xoá rồi tạo lại**. Thứ tự này bắt buộc: xoá hồ sơ
> lái xe trước rồi mới tìm tài khoản là cắt sợi dây rồi hỏi nó dẫn tới đâu — các hàng tài khoản
> thành mồ côi và lần gieo lại kế tiếp chết ở ràng buộc tên đăng nhập duy nhất, tức lệnh reset chỉ
> chạy được đúng một lần.

---

## 4. Khởi động lại dịch vụ

```bash
"${COMPOSE[@]}" restart api web
"${COMPOSE[@]}" ps --format '{{.Service}} {{.State}} {{.Health}}'
```

`api` mất khoảng 20 giây để chuyển sang `healthy`. Dữ liệu **không** mất khi khởi động lại — đã đo:
tổng số bản ghi và một hàng mốc cụ thể giống hệt nhau trước và sau.

---

## 5. Hai giới hạn nền tảng đang mở — người vận hành cần biết

Hai điều dưới đây **đã được đo trên bản chạy thật** và **chưa được sửa**. Chúng nằm trong image
dùng chung với các khách hàng khác, nên sửa chúng là đổi hành vi của những stack đó — một quyết
định thuộc về chủ nền tảng, không thuộc một tác vụ chuẩn bị demo.

### 5.1 Khi PostgreSQL không dùng được, thông báo cho người dùng không đúng

| Tình huống                                        | Người dùng nhận được                             | Thời gian            |
| ------------------------------------------------- | ------------------------------------------------ | -------------------- |
| PostgreSQL **treo** (đứt mạng, kẹt đĩa)           | **Không phản hồi gì**, và không một dòng log nào | Treo tới **90 giây** |
| PostgreSQL **dừng hẳn** (sập, đang khởi động lại) | `Bạn cần đăng nhập`                              | 0,11 giây            |

Trường hợp thứ hai nhanh và sạch nhưng **nói sai**: nó bảo người dùng đăng nhập lại trong khi sự
thật là cơ sở dữ liệu đã chết. Người dùng đăng nhập lại, lại hỏng, và không bao giờ được cho biết
vì sao. Nguyên nhân: phiên đăng nhập lưu trong PostgreSQL, nên "kho phiên hỏng" không phân biệt
được với "chưa đăng nhập".

**Cách nhận ra khi đang trực:** nếu nhiều người cùng lúc báo bị đăng xuất, hãy kiểm PostgreSQL
trước khi kiểm tài khoản.

### 5.2 `/health` báo `ok` khi cơ sở dữ liệu đã chết

Trong một cửa sổ **47 giây** PostgreSQL thật sự dừng hẳn, `/health` vẫn trả `200 {"status":"ok"}`.

Endpoint này **cố ý** chỉ là phép kiểm "tiến trình còn sống": nếu nó phán xét một phụ thuộc thì
Docker sẽ giết và tạo lại container theo vòng lặp mỗi khi CSDL chớp. Nhưng chính tệp đó đã phơi bày
trạng thái của kênh chat để cổng sức khoẻ không nói dối — và **không có phần nào cho cơ sở dữ
liệu**, trong khi CSDL là phụ thuộc **duy nhất không tuỳ chọn**.

**Hệ quả thực tế:** đừng dùng `/health` một mình để kết luận hệ thống khoẻ. Kiểm thêm bằng một
lệnh đọc thật:

```bash
curl -s -H "Origin: https://demo-transport-preview-gd1-test.35-187-235-82.sslip.io" \
  https://operator-transport-preview-gd1-test.35-187-235-82.sslip.io/health
"${COMPOSE[@]}" exec -T postgres pg_isready -U postgres
```

Hai lệnh cùng xanh mới là khoẻ. Một mình lệnh đầu thì chưa.
