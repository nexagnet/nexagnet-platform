# Chuyển sang dữ liệu thật

Bản đang chạy dùng **dữ liệu nghĩ ra**: công ty, đội xe, mười hai lái xe, năm khách hàng, ba cây
xăng, ba đối tác — không ai trong đó có thật, không số điện thoại nào gọi được. Tài liệu này là
thủ tục thay toàn bộ chỗ đó bằng dữ liệu của doanh nghiệp.

---

## 1. Sáu mẫu thu thập

Nằm ở `tenants/transport-preview/templates/`. Điền theo đúng tên cột, giữ nguyên hàng tiêu đề.

| Mẫu                    | Cột                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `xe.csv`               | Biển số · Hạng xe · Tải trọng (kg) · Số km hiện tại                                             |
| `lai-xe.csv`           | Họ và tên · Số điện thoại · Hạng GPLX · Hạn GPLX · Xe phụ trách                                 |
| `khach-hang.csv`       | Tên khách hàng · Số điện thoại · Mã số thuế · Địa chỉ · Hạn thanh toán (ngày) · Hạn mức công nợ |
| `doi-tac.csv`          | Tên đối tác · Số điện thoại · Vai trò (`CARRIER` = nhà xe, `ORDER_REFERRER` = nguồn đơn)        |
| `tuyen-duong.csv`      | Điểm đi · Điểm đến · Quãng đường (km) · Giá cước · Giá thuê nhà xe                              |
| `bang-ke-cay-xang.csv` | Biển số · Ngày · Số lít · Thành tiền · Số hoá đơn · Ghi chú                                     |

Quy ước chung: ngày `DD/MM/YYYY`, tiền là **số nguyên đồng không dấu phân cách** (`4200000`), số
lít dùng **dấu chấm** làm dấu thập phân (`16.400` là 16,4 lít).

### Mẫu nào nhập được vào sản phẩm, mẫu nào không — nói thẳng

| Mẫu                                                        | Đường vào hệ thống                                                                                                                                                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bang-ke-cay-xang.csv`                                     | **Nhập trực tiếp trên màn hình** Nhiên liệu → _Nhập bảng kê_. Có xem trước, có báo lỗi theo tên cột.                                                                                                                                  |
| `xe.csv` · `lai-xe.csv` · `khach-hang.csv` · `doi-tac.csv` | **Nhập tay qua biểu mẫu** ở màn hình _Đội xe & lái xe_. **Chưa có nhập hàng loạt.**                                                                                                                                                   |
| `tuyen-duong.csv`                                          | **Chưa phải dữ liệu của sản phẩm.** Tuyến đường hiện không phải một đối tượng riêng: mỗi chuyến mang điểm đi, điểm đến và giá cước của chính nó. Mẫu này dùng để thống nhất bảng giá tuyến với khách, rồi người lập chuyến điền theo. |

> Bốn mẫu ở giữa là **mẫu thu thập**, không phải mẫu nhập liệu. Với quy mô mười xe và mươi lái xe,
> nhập tay một lần là chuyện của một buổi. Nếu khách có vài trăm đầu mục, hãy nêu ra — làm một
> đường nhập hàng loạt là việc có thật, không phải việc khó.

---

## 2. Danh sách kiểm trước khi chạy thật

Theo thứ tự; mỗi bước phụ thuộc bước trước.

### Bước 1 — Xoá sạch dữ liệu mẫu

Không sửa đè lên dữ liệu mẫu. Xoá hẳn rồi nhập lại — xem
[`van-hanh-ban-demo.md`](van-hanh-ban-demo.md).

- [ ] Đã sao lưu trước khi xoá
- [ ] Đã xoá và xác nhận các màn hình đều trống

### Bước 2 — Danh mục nền

Theo thứ tự này, vì cái sau tham chiếu cái trước:

- [ ] **Xe** — biển số, hạng xe, tải trọng, số km đồng hồ hiện tại
- [ ] **Lái xe** — họ tên, điện thoại, hạng và hạn giấy phép
- [ ] Gán **xe phụ trách** cho từng lái xe
- [ ] **Khách hàng** — tên, mã số thuế, địa chỉ, **hạn thanh toán**, **hạn mức công nợ**
- [ ] **Đối tác** — kèm vai: nhà xe, nguồn đơn, hoặc cả hai
- [ ] **Cây xăng** — tên, mã, mã số thuế
- [ ] **Địa điểm vận hành** — bãi xe (đúng **một** bãi đang dùng), kho của khách, nhà máy của đối
      tác: nhập ở _Quản trị → Địa điểm vận hành_, sau khi đã có khách hàng và đối tác

> Hạn thanh toán của khách hàng quyết định toàn bộ bảng tuổi nợ. Điền sai ở đây thì báo cáo công
> nợ sai từ ngày đầu, và sai một cách trông rất hợp lý.

### Bước 3 — Tài khoản đăng nhập

- [ ] Một tài khoản **Giám đốc** (`ADMIN`)
- [ ] Tài khoản **Kế toán** (`ACCOUNTING`) — nhớ ba việc kế toán **không** làm được: huỷ chuyến,
      mở lại kỳ quỹ, mở lại kỳ đối soát
- [ ] Một tài khoản cho **mỗi lái xe**, nối với đúng hồ sơ lái xe (_Quản trị → Tài khoản & quyền_)
- [ ] Đã chuyển mật khẩu tạm (hạn 72 giờ) cho từng người, và mỗi người đã tự đổi ở lần đăng nhập
      đầu
- [ ] Người **Điều hành / Quản lý**: Giám đốc đã chọn nhóm việc cho từng người (vai này bắt đầu
      **trống** — xem [README](README.md#tài-khoản--quyền))

### Bước 4 — Chính sách

- [ ] **Ngưỡng cảnh báo giấy tờ** — báo trước bao nhiêu ngày, theo từng loại giấy tờ
- [ ] **Định mức nhiên liệu** theo hạng xe (lít/100km) — dùng để phát hiện tiêu hao bất thường
- [ ] **Dung sai đối soát** — lệch bao nhiêu đồng và bao nhiêu ngày thì vẫn coi là khớp
- [ ] **Nhóm chi phí chuyến** — danh sách khách thực sự dùng
- [ ] **Chính sách lương** — lương cơ bản, khoán theo chuyến, khoán theo km, thưởng
- [ ] **Múi giờ** — mặc định `Asia/Ho_Chi_Minh`

### Bước 5 — Số dư mở đầu

- [ ] **Công nợ phải thu** đang treo của từng khách
- [ ] **Số dư quỹ** đang có của từng lái xe
- [ ] **Công nợ phải trả** cây xăng, nhà xe, hoa hồng đối tác
- [ ] **Giấy tờ xe và lái xe** đang còn hiệu lực, kèm ngày hết hạn thật
- [ ] **Lịch bảo dưỡng** và số km cơ sở của từng xe

### Bước 6 — Chạy thử một tuần song song

- [ ] Chạy một tuần **song song với cách làm cũ**, đối chiếu ba con số: tổng công nợ, số dư quỹ
      từng lái xe, kết quả đối soát một cây xăng
- [ ] Đối soát trọn một kỳ bảng kê thật của một cây xăng
- [ ] Chạy thử một kỳ lương, đối chiếu với bảng lương làm tay
- [ ] Cho **hai lái xe** dùng thật trên điện thoại của họ trước khi mở cho cả đội

---

## 3. Những điều bản demo đang **giả định** — cần khách chốt

Bản đang chạy phải chọn một phương án cho mỗi mục dưới đây để chạy được. Mỗi mục là một **lựa chọn
cấu hình**, không phải một giới hạn — nhưng chưa mục nào được khách xác nhận.

| #   | Đang giả định                                       | Câu cần hỏi khách                                                                                  |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | Cảnh báo giấy tờ báo trước 30–45 ngày tuỳ loại      | Anh muốn báo trước bao nhiêu ngày? Cùng một mốc cho mọi loại giấy tờ, hay đăng kiểm khác bảo hiểm? |
| 2   | Bảng kê cây xăng là CSV/XLSX, cột cố định           | Cây xăng của anh gửi bảng kê dạng gì? Excel, CSV, hay bản in?                                      |
| 3   | Dung sai đối soát 1.000đ và 1 ngày                  | Lệch bao nhiêu thì anh vẫn coi là khớp?                                                            |
| 4   | Hoa hồng đối tác tính theo % giá cước               | Hoa hồng của anh tính theo phần trăm hay theo tuyến?                                               |
| 5   | Lương = cơ bản + khoán chuyến + khoán km + thưởng   | Cơ cấu lương thật của anh gồm những khoản nào?                                                     |
| 6   | Lệch nhiên liệu **không** tự trừ lương              | Khi lái xe khai lệch, anh muốn xử lý thế nào — nhắc, trừ quỹ, hay trừ lương? Ai được quyết?        |
| 7   | Kế toán không được huỷ chuyến, không được mở lại kỳ | Ba việc này anh muốn ai làm?                                                                       |
| 8   | Vai _Quản lý_ chưa có quyền vận tải nào             | Công ty anh có vai điều độ/quản lý đội xe không? Họ cần thấy gì?                                   |
| 9   | Biên **không** phân bổ chi phí cố định              | Anh muốn thấy biên trực tiếp, hay muốn phân bổ cả khấu hao và chi phí văn phòng vào từng chuyến?   |
| 10  | Chuyến đã đối soát bị khoá hoàn toàn                | Có trường hợp nào cần mở lại một chuyến đã chốt không? Ai được phép?                               |
| 11  | Không nối phần mềm kế toán / ERP                    | Anh đang dùng phần mềm gì cho kế toán? Có cần đẩy số sang không, và theo chiều nào?                |
| 12  | Lái xe không xem được giá cước                      | Có lái xe nào cần biết giá cước không — ví dụ khi tự thu tiền của khách?                           |

> Cách dùng bảng này trong buổi demo: đừng đọc nó như danh sách thiếu sót. Mỗi dòng là một chỗ hệ
> thống **chờ khách quyết**, và hỏi đúng lúc đang xem màn hình liên quan sẽ ra câu trả lời tốt hơn
> hỏi rời. [`kich-ban-demo.md`](kich-ban-demo.md) gài sẵn từng câu vào đúng chỗ.
